require("dotenv").config();

const express = require("express");
const session = require("express-session");
const mysql = require("mysql2/promise");
const QRCode = require("qrcode");
const crypto = require("crypto");

const app = express();

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.use(session({
  secret: process.env.SESSION_SECRET || "replace-this-session-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 4
  }
}));

app.use((req, res, next) => {
  res.locals.currentMerchant = req.session.merchant || null;
  next();
});

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.BVNK_WEBHOOK_SECRET || "change-me-local-secret";
const PAYMENT_EXPIRY_MINUTES = Number(process.env.PAYMENT_EXPIRY_MINUTES || 15);
const SETTLEMENT_DELAY_DAYS = Number(process.env.SETTLEMENT_DELAY_DAYS || 1);
const SETTLEMENT_CUTOFF_HOUR = Number(process.env.SETTLEMENT_CUTOFF_HOUR || 17);
const PROCESSOR_FEE_PERCENT = Number(process.env.PROCESSOR_FEE_PERCENT || 1.5);
const NETWORK_FEE_SGD = Number(process.env.NETWORK_FEE_SGD || 0.2);
const VALID_CRYPTO_CURRENCIES = ["USDT", "USDC", "ETH"];
const VALID_NETWORKS = ["TRON", "ETHEREUM", "POLYGON"];

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "uniweb_crytpo_payment",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

function mapPayment(row) {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    customerName: row.customer_name,
    fiatAmount: Number(row.fiat_amount),
    fiatCurrency: row.fiat_currency,
    cryptoCurrency: row.crypto_currency,
    network: row.network,
    exchangeRate: Number(row.exchange_rate),
    cryptoAmount: Number(row.crypto_amount),
    walletAddress: row.wallet_address,
    reference: row.reference,
    paymentStatus: row.payment_status,
    settlementStatus: row.settlement_status,
    statusReason: row.status_reason,
    processorFee: Number(row.processor_fee || 0),
    networkFee: Number(row.network_fee || 0),
    netSettlementAmount: Number(row.net_settlement_amount || row.fiat_amount),
    createdAt: new Date(row.created_at).toLocaleString(),
    expiresAt: row.expires_at ? new Date(row.expires_at).toLocaleString() : null,
    expiresAtIso: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    paidAt: row.paid_at ? new Date(row.paid_at).toLocaleString() : null,
    settledAt: row.settled_at ? new Date(row.settled_at).toLocaleString() : null,
    isExpired: row.expires_at ? new Date(row.expires_at).getTime() <= Date.now() : false
  };
}

function requireAuth(req, res, next) {
  if (!req.session.merchant) {
    return res.redirect("/login");
  }

  next();
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

function verifyPassword(password, salt, expectedHash) {
  const actualHash = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
}

function calculateFees(fiatAmount) {
  const processorFee = Number((fiatAmount * (PROCESSOR_FEE_PERCENT / 100)).toFixed(2));
  const networkFee = Number(NETWORK_FEE_SGD.toFixed(2));
  const netSettlementAmount = Number(Math.max(fiatAmount - processorFee - networkFee, 0).toFixed(2));

  return { processorFee, networkFee, netSettlementAmount };
}

function formatSqlDate(date) {
  return date.toISOString().slice(0, 10);
}

function isBusinessDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function addBusinessDays(date, days) {
  const result = new Date(date);
  let remaining = days;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);

    if (isBusinessDay(result)) {
      remaining -= 1;
    }
  }

  return result;
}

function calculateSettlementDate(fromDate = new Date()) {
  const base = new Date(fromDate);
  const delayDays = base.getHours() >= SETTLEMENT_CUTOFF_HOUR
    ? SETTLEMENT_DELAY_DAYS + 1
    : SETTLEMENT_DELAY_DAYS;

  return formatSqlDate(addBusinessDays(base, delayDays));
}

function generateReference() {
  return "UNIWEB-" + Date.now();
}

function generateMockWalletAddress(network) {
  if (network === "TRON") return "TMockBVNKWallet" + Math.floor(Math.random() * 999999);
  if (network === "ETHEREUM") return "0xMockBVNKWallet" + Math.floor(Math.random() * 999999);
  if (network === "POLYGON") return "0xPolygonMockBVNK" + Math.floor(Math.random() * 999999);
  return "MockBVNKWallet" + Math.floor(Math.random() * 999999);
}

function calculateCryptoAmount(fiatAmount) {
  const exchangeRate = 1.34;
  return {
    exchangeRate,
    cryptoAmount: Number((fiatAmount / exchangeRate).toFixed(2))
  };
}

function buildQrPayload(payment) {
  const params = new URLSearchParams({
    amount: payment.cryptoAmount.toString(),
    currency: payment.cryptoCurrency,
    network: payment.network,
    reference: payment.reference
  });

  return `crypto:${payment.walletAddress}?${params.toString()}`;
}

async function getAllPayments(merchantId) {
  const [rows] = await pool.query(
    `SELECT payments.*, merchants.name AS merchant_name
     FROM payments
     INNER JOIN merchants ON merchants.id = payments.merchant_id
     WHERE payments.merchant_id = ?
     ORDER BY payments.created_at DESC, payments.id DESC`,
    [merchantId]
  );
  return rows.map(mapPayment);
}

async function expireOverduePayments() {
  await pool.execute(
    `UPDATE payments
     SET payment_status = 'EXPIRED',
         status_reason = 'Payment link expired before blockchain confirmation'
     WHERE payment_status = 'PENDING'
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()`
  );
}

async function getDashboardStats(merchantId) {
  const [rows] = await pool.query(
    `SELECT
      COUNT(*) AS totalPayments,
      SUM(payment_status = 'PENDING') AS pendingPayments,
      SUM(payment_status = 'PAID') AS paidPayments,
      SUM(payment_status = 'EXPIRED') AS expiredPayments,
      SUM(settlement_status = 'SETTLED_TO_MERCHANT_SGD') AS settledPayments,
      SUM(settlement_status = 'SCHEDULED_T_PLUS_1') AS scheduledSettlements
     FROM payments
     WHERE merchant_id = ?`,
    [merchantId]
  );

  const stats = rows[0];
  return {
    totalPayments: Number(stats.totalPayments || 0),
    pendingPayments: Number(stats.pendingPayments || 0),
    paidPayments: Number(stats.paidPayments || 0),
    expiredPayments: Number(stats.expiredPayments || 0),
    settledPayments: Number(stats.settledPayments || 0),
    scheduledSettlements: Number(stats.scheduledSettlements || 0)
  };
}

async function getPaymentById(id) {
  const [rows] = await pool.query(
    `SELECT payments.*, merchants.name AS merchant_name
     FROM payments
     INNER JOIN merchants ON merchants.id = payments.merchant_id
     WHERE payments.id = ?`,
    [id]
  );
  return rows[0] ? mapPayment(rows[0]) : null;
}

async function getPaymentByReference(reference) {
  const [rows] = await pool.query(
    `SELECT payments.*, merchants.name AS merchant_name
     FROM payments
     INNER JOIN merchants ON merchants.id = payments.merchant_id
     WHERE payments.reference = ?`,
    [reference]
  );
  return rows[0] ? mapPayment(rows[0]) : null;
}

async function createPayment(data) {
  const [result] = await pool.execute(
    `INSERT INTO payments (
      merchant_id,
      merchant_name,
      customer_name,
      fiat_amount,
      fiat_currency,
      crypto_currency,
      network,
      exchange_rate,
      crypto_amount,
      wallet_address,
      reference,
      payment_status,
      settlement_status,
      processor_fee,
      network_fee,
      net_settlement_amount,
      expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [
      data.merchantId,
      data.merchantName,
      data.customerName,
      data.fiatAmount,
      data.fiatCurrency,
      data.cryptoCurrency,
      data.network,
      data.exchangeRate,
      data.cryptoAmount,
      data.walletAddress,
      data.reference,
      data.paymentStatus,
      data.settlementStatus,
      data.processorFee,
      data.networkFee,
      data.netSettlementAmount,
      PAYMENT_EXPIRY_MINUTES
    ]
  );

  return getPaymentById(result.insertId);
}

async function getWebhookEventByEventId(eventId) {
  if (!eventId) return null;

  const [rows] = await pool.query(
    `SELECT
      webhook_events.event_id,
      payments.id AS payment_id,
      payments.reference,
      payments.payment_status,
      payments.settlement_status
     FROM webhook_events
     INNER JOIN payments ON payments.id = webhook_events.payment_id
     WHERE webhook_events.event_id = ?`,
    [eventId]
  );

  return rows[0] || null;
}

async function recordWebhookEvent(paymentId, eventType, payload) {
  await pool.execute(
    "INSERT INTO webhook_events (payment_id, event_id, event_type, payload) VALUES (?, ?, ?, ?)",
    [paymentId, payload.eventId || null, eventType, JSON.stringify(payload)]
  );
}

async function getUserByEmail(email) {
  const [rows] = await pool.query(
    `SELECT
      merchant_users.*,
      merchants.name AS merchant_name
     FROM merchant_users
     INNER JOIN merchants ON merchants.id = merchant_users.merchant_id
     WHERE merchant_users.email = ?`,
    [email]
  );

  return rows[0] || null;
}

async function ensureDemoMerchantAccount() {
  const email = "merchant@uniweb.test";
  const password = "password123";
  const [merchantRows] = await pool.query("SELECT id FROM merchants WHERE name = ?", ["ABC Retail Store"]);
  let merchantId = merchantRows[0]?.id;

  if (!merchantId) {
    const [merchantResult] = await pool.execute(
      `INSERT INTO merchants (
        name,
        settlement_currency,
        bank_account_label,
        bank_name,
        account_holder_name,
        account_last4
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      ["ABC Retail Store", "SGD", "DBS Business Account ****1234", "DBS", "ABC Retail Store Pte Ltd", "1234"]
    );
    merchantId = merchantResult.insertId;
  }

  await pool.execute(
    `UPDATE merchants
     SET bank_name = COALESCE(bank_name, 'DBS'),
         account_holder_name = COALESCE(account_holder_name, 'ABC Retail Store Pte Ltd'),
         account_last4 = COALESCE(account_last4, '1234')
     WHERE id = ?`,
    [merchantId]
  );

  const [userRows] = await pool.query("SELECT id FROM merchant_users WHERE email = ?", [email]);

  if (userRows.length === 0) {
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);

    await pool.execute(
      `INSERT INTO merchant_users (
        merchant_id,
        email,
        password_hash,
        password_salt,
        full_name
      ) VALUES (?, ?, ?, ?, ?)`,
      [merchantId, email, passwordHash, salt, "Demo Merchant Admin"]
    );
  }

  await pool.execute(
    `UPDATE payments
     SET merchant_id = ?
     WHERE merchant_id IS NULL`,
    [merchantId]
  );
}

async function recordBlockchainTransaction(payment, payload) {
  await pool.execute(
    `INSERT INTO blockchain_transactions (
      payment_id,
      tx_hash,
      network,
      from_wallet,
      to_wallet,
      expected_amount,
      received_amount,
      currency,
      confirmations,
      confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      payment.id,
      payload.txHash || `mock-${Date.now()}`,
      payload.network || payment.network,
      payload.fromWallet || "MockCustomerWallet",
      payment.walletAddress,
      payment.cryptoAmount,
      payload.receivedAmount || payment.cryptoAmount,
      payload.receivedCurrency || payment.cryptoCurrency,
      payload.confirmations || 12
    ]
  );
}

async function getBlockchainTransactions(paymentId) {
  const [rows] = await pool.query(
    `SELECT *
     FROM blockchain_transactions
     WHERE payment_id = ?
     ORDER BY confirmed_at DESC, id DESC`,
    [paymentId]
  );

  return rows.map(row => ({
    txHash: row.tx_hash,
    network: row.network,
    fromWallet: row.from_wallet,
    toWallet: row.to_wallet,
    expectedAmount: Number(row.expected_amount),
    receivedAmount: Number(row.received_amount),
    currency: row.currency,
    confirmations: row.confirmations,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toLocaleString() : null
  }));
}

async function assignPaymentsToTPlusOneBatch(merchantId, paymentIds = null) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const paymentFilter = paymentIds && paymentIds.length > 0
      ? `AND id IN (${paymentIds.map(() => "?").join(",")})`
      : "";
    const params = paymentIds && paymentIds.length > 0 ? [merchantId, ...paymentIds] : [merchantId];

    const [payments] = await connection.query(
      `SELECT *
       FROM payments
       WHERE merchant_id = ?
         AND payment_status = 'PAID'
         AND settlement_status = 'SETTLEMENT_PENDING'
         ${paymentFilter}
       FOR UPDATE`,
      params
    );

    if (payments.length === 0) {
      await connection.rollback();
      return null;
    }

    const grossAmount = payments.reduce((sum, payment) => sum + Number(payment.fiat_amount), 0);
    const totalFees = payments.reduce(
      (sum, payment) => sum + Number(payment.processor_fee || 0) + Number(payment.network_fee || 0),
      0
    );
    const netAmount = payments.reduce((sum, payment) => sum + Number(payment.net_settlement_amount), 0);
    const settlementDate = calculateSettlementDate();

    const [existingBatches] = await connection.query(
      `SELECT id
       FROM settlement_batches
       WHERE merchant_id = ?
         AND settlement_date = ?
         AND status = 'SCHEDULED_T_PLUS_1'
       FOR UPDATE`,
      [merchantId, settlementDate]
    );
    let batchId = existingBatches[0]?.id;

    if (!batchId) {
      const batchReference = `TPLUS1-${settlementDate.replace(/-/g, "")}-${Date.now()}`;
      const [batchResult] = await connection.execute(
        `INSERT INTO settlement_batches (
          merchant_id,
          batch_reference,
          payment_count,
          gross_amount,
          total_fees,
          net_amount,
          settlement_date,
          status,
          payout_status,
          settled_at
        ) VALUES (?, ?, 0, 0, 0, 0, ?, 'SCHEDULED_T_PLUS_1', 'SCHEDULED', NULL)`,
        [merchantId, batchReference, settlementDate]
      );
      batchId = batchResult.insertId;
    }

    for (const payment of payments) {
      await connection.execute(
        `INSERT INTO settlement_batch_items (
          batch_id,
          payment_id,
          gross_amount,
          processor_fee,
          network_fee,
          net_amount
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          batchId,
          payment.id,
          payment.fiat_amount,
          payment.processor_fee || 0,
          payment.network_fee || 0,
          payment.net_settlement_amount
        ]
      );
    }

    await connection.execute(
      `UPDATE settlement_batches
       SET payment_count = payment_count + ?,
           gross_amount = gross_amount + ?,
           total_fees = total_fees + ?,
           net_amount = net_amount + ?
       WHERE id = ?`,
      [
        payments.length,
        grossAmount.toFixed(2),
        totalFees.toFixed(2),
        netAmount.toFixed(2),
        batchId
      ]
    );

    await connection.query(
      `UPDATE payments
       SET settlement_status = 'SCHEDULED_T_PLUS_1'
       WHERE id IN (${payments.map(() => "?").join(",")})`,
      payments.map(payment => payment.id)
    );

    await connection.commit();
    return batchId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getSettlementBatches(merchantId) {
  const [rows] = await pool.query(
    `SELECT
      settlement_batches.*,
      merchants.bank_name,
      merchants.account_holder_name,
      merchants.account_last4
     FROM settlement_batches
     INNER JOIN merchants ON merchants.id = settlement_batches.merchant_id
     WHERE settlement_batches.merchant_id = ?
     ORDER BY COALESCE(settlement_batches.settled_at, settlement_batches.settlement_date, settlement_batches.created_at) DESC,
              settlement_batches.id DESC`,
    [merchantId]
  );

  return rows.map(row => ({
    id: row.id,
    batchReference: row.batch_reference,
    paymentCount: row.payment_count,
    grossAmount: Number(row.gross_amount),
    totalFees: Number(row.total_fees),
    netAmount: Number(row.net_amount),
    status: row.status,
    payoutStatus: row.payout_status,
    bankName: row.bank_name,
    accountHolderName: row.account_holder_name,
    accountLast4: row.account_last4,
    settlementDate: row.settlement_date ? new Date(row.settlement_date).toLocaleDateString() : null,
    settledAt: row.settled_at ? new Date(row.settled_at).toLocaleString() : null
  }));
}

async function settleDueTPlusOneBatches() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [batches] = await connection.query(
      `SELECT id
       FROM settlement_batches
       WHERE status = 'SCHEDULED_T_PLUS_1'
         AND settlement_date <= CURDATE()
       FOR UPDATE`
    );

    if (batches.length === 0) {
      await connection.commit();
      return 0;
    }

    const batchIds = batches.map(batch => batch.id);

    await connection.query(
      `UPDATE settlement_batches
       SET status = 'PROCESSING_BANK_TRANSFER',
           payout_status = 'PROCESSING_BANK_TRANSFER'
       WHERE id IN (${batchIds.map(() => "?").join(",")})`,
      batchIds
    );

    await connection.query(
      `UPDATE settlement_batches
       SET status = 'SETTLED',
           payout_status = 'PAID_OUT',
           settled_at = NOW()
       WHERE id IN (${batchIds.map(() => "?").join(",")})`,
      batchIds
    );

    await connection.query(
      `UPDATE payments
       INNER JOIN settlement_batch_items ON settlement_batch_items.payment_id = payments.id
       SET payments.settlement_status = 'SETTLED_TO_MERCHANT_SGD',
           payments.settled_at = NOW()
       WHERE settlement_batch_items.batch_id IN (${batchIds.map(() => "?").join(",")})`,
      batchIds
    );

    await connection.commit();
    return batchIds.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function validatePaymentForm(body) {
  const errors = [];
  const fiatAmount = Number(body.fiatAmount);
  const customerName = String(body.customerName || "").trim();
  const cryptoCurrency = String(body.cryptoCurrency || "").trim().toUpperCase();
  const network = String(body.network || "").trim().toUpperCase();

  if (!customerName) errors.push("Customer name is required");
  if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) errors.push("SGD amount must be greater than 0");
  if (!VALID_CRYPTO_CURRENCIES.includes(cryptoCurrency)) errors.push("Unsupported crypto currency");
  if (!VALID_NETWORKS.includes(network)) errors.push("Unsupported network");

  return {
    errors,
    data: {
      customerName,
      fiatAmount,
      cryptoCurrency,
      network
    }
  };
}

async function processBvnkWebhook(payload) {
  const eventType = payload.eventType;
  const existingEvent = await getWebhookEventByEventId(payload.eventId);

  if (existingEvent) {
    return {
      id: existingEvent.payment_id,
      reference: existingEvent.reference,
      paymentStatus: existingEvent.payment_status,
      settlementStatus: existingEvent.settlement_status,
      duplicateWebhook: true
    };
  }

  const payment = payload.reference
    ? await getPaymentByReference(payload.reference)
    : await getPaymentById(Number(payload.paymentId));

  if (!payment) {
    const error = new Error("Payment not found");
    error.statusCode = 404;
    throw error;
  }

  if (eventType === "PAYMENT_CONFIRMED") {
    if (payment.paymentStatus === "EXPIRED") {
      const error = new Error("Payment is expired and cannot be confirmed");
      error.statusCode = 409;
      throw error;
    }

    if (payment.isExpired && payment.paymentStatus === "PENDING") {
      await expireOverduePayments();
      const error = new Error("Payment expired before confirmation");
      error.statusCode = 409;
      throw error;
    }

    await pool.execute(
      `UPDATE payments
       SET payment_status = 'PAID',
           settlement_status = 'SETTLEMENT_PENDING',
           paid_at = NOW(),
           status_reason = NULL
       WHERE id = ?`,
      [payment.id]
    );

    await recordBlockchainTransaction(payment, payload);
  } else if (eventType === "SETTLEMENT_COMPLETED") {
    await settleDueTPlusOneBatches();
  } else if (eventType === "PAYMENT_FAILED") {
    await pool.execute(
      `UPDATE payments
       SET payment_status = 'FAILED',
           status_reason = ?
       WHERE id = ?`,
      [payload.reason || "Payment failed", payment.id]
    );
  } else {
    const error = new Error("Unsupported webhook event type");
    error.statusCode = 400;
    throw error;
  }

  await recordWebhookEvent(payment.id, eventType, payload);
  const updatedPayment = await getPaymentById(payment.id);

  if (eventType === "PAYMENT_CONFIRMED") {
    await assignPaymentsToTPlusOneBatch(updatedPayment.merchantId, [updatedPayment.id]);
    return getPaymentById(payment.id);
  }

  return updatedPayment;
}

async function getWebhookEvents(merchantId) {
  const [rows] = await pool.query(
    `SELECT
      webhook_events.id,
      webhook_events.event_type,
      webhook_events.payload,
      webhook_events.received_at,
      payments.reference,
      payments.merchant_name
     FROM webhook_events
     INNER JOIN payments ON payments.id = webhook_events.payment_id
     WHERE payments.merchant_id = ?
     ORDER BY webhook_events.received_at DESC, webhook_events.id DESC
     LIMIT 100`,
    [merchantId]
  );

  return rows.map(row => ({
    id: row.id,
    eventType: row.event_type,
    payload: typeof row.payload === "string" ? row.payload : JSON.stringify(row.payload),
    receivedAt: new Date(row.received_at).toLocaleString(),
    reference: row.reference,
    merchantName: row.merchant_name
  }));
}

app.get("/login", (req, res) => {
  if (req.session.merchant) {
    return res.redirect("/");
  }

  res.render("login", { error: null });
});

app.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await getUserByEmail(email);

    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      return res.status(401).render("login", { error: "Invalid email or password" });
    }

    req.session.merchant = {
      id: user.merchant_id,
      name: user.merchant_name,
      userId: user.id,
      email: user.email
    };

    res.redirect("/");
  } catch (error) {
    next(error);
  }
});

app.post("/logout", (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.redirect("/login");
  });
});

app.get("/", requireAuth, async (req, res, next) => {
  try {
    await expireOverduePayments();
    const payments = await getAllPayments(req.session.merchant.id);
    const stats = await getDashboardStats(req.session.merchant.id);

    res.render("dashboard", {
      payments,
      ...stats
    });
  } catch (error) {
    next(error);
  }
});

app.get("/create-payment", requireAuth, (req, res) => {
  res.render("create-payment");
});

app.post("/create-payment", requireAuth, async (req, res, next) => {
  try {
    const validation = validatePaymentForm(req.body);

    if (validation.errors.length > 0) {
      return res.status(400).send(validation.errors.join(", "));
    }

    const { customerName, fiatAmount, cryptoCurrency, network } = validation.data;
    const { exchangeRate, cryptoAmount } = calculateCryptoAmount(fiatAmount);
    const fees = calculateFees(fiatAmount);

    const payment = await createPayment({
      merchantId: req.session.merchant.id,
      merchantName: req.session.merchant.name,
      customerName,
      fiatAmount,
      fiatCurrency: "SGD",
      cryptoCurrency,
      network,
      exchangeRate,
      cryptoAmount,
      walletAddress: generateMockWalletAddress(network),
      reference: generateReference(),
      paymentStatus: "PENDING",
      settlementStatus: "NOT_SETTLED",
      ...fees
    });

    res.redirect(`/payment/${payment.id}`);
  } catch (error) {
    next(error);
  }
});

app.get("/payment/:id", async (req, res, next) => {
  try {
    await expireOverduePayments();
    const payment = await getPaymentById(Number(req.params.id));

    if (!payment) {
      return res.status(404).send("Payment not found");
    }

    const qrCodeDataUrl = await QRCode.toDataURL(buildQrPayload(payment), {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240
    });
    const blockchainTransactions = await getBlockchainTransactions(payment.id);

    res.render("payment-page", { payment, qrCodeDataUrl, blockchainTransactions });
  } catch (error) {
    next(error);
  }
});

app.post("/simulate-payment/:id", async (req, res, next) => {
  try {
    const payment = await getPaymentById(Number(req.params.id));

    if (!payment) {
      return res.status(404).send("Payment not found");
    }

    await processBvnkWebhook({
      eventId: `evt_${crypto.randomBytes(12).toString("hex")}`,
      eventType: "PAYMENT_CONFIRMED",
      reference: payment.reference,
      source: "mock-simulation",
      txHash: `0x${crypto.randomBytes(16).toString("hex")}`,
      network: payment.network,
      fromWallet: `MockCustomerWallet${Math.floor(Math.random() * 999999)}`,
      receivedAmount: payment.cryptoAmount,
      receivedCurrency: payment.cryptoCurrency,
      confirmations: 12
    });

    res.redirect(`/payment/${payment.id}`);
  } catch (error) {
    next(error);
  }
});

app.post("/webhooks/bvnk", async (req, res, next) => {
  try {
    if (req.get("x-webhook-secret") !== WEBHOOK_SECRET) {
      return res.status(401).json({ received: false, error: "Invalid webhook secret" });
    }

    const payment = await processBvnkWebhook(req.body);

    res.json({
      received: true,
      paymentId: payment.id,
      reference: payment.reference,
      paymentStatus: payment.paymentStatus,
      settlementStatus: payment.settlementStatus,
      duplicateWebhook: Boolean(payment.duplicateWebhook)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/transactions", requireAuth, async (req, res, next) => {
  try {
    await expireOverduePayments();
    const payments = await getAllPayments(req.session.merchant.id);
    res.render("transactions", { payments });
  } catch (error) {
    next(error);
  }
});

app.get("/webhook-events", requireAuth, async (req, res, next) => {
  try {
    const events = await getWebhookEvents(req.session.merchant.id);
    res.render("webhook-events", { events });
  } catch (error) {
    next(error);
  }
});

app.get("/settlement-batches", requireAuth, async (req, res, next) => {
  try {
    const batches = await getSettlementBatches(req.session.merchant.id);
    res.render("settlement-batches", { batches });
  } catch (error) {
    next(error);
  }
});

app.get("/about-flow", (req, res) => {
  res.render("about-flow");
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.statusCode || 500).send(error.message || "Server error");
});

async function startServer() {
  try {
    await pool.query("SELECT 1");
    await ensureDemoMerchantAccount();

    await expireOverduePayments();
    await settleDueTPlusOneBatches();
    setInterval(() => {
      expireOverduePayments().catch(error => {
        console.error("Payment expiry job failed:", error.message);
      });
    }, 60 * 1000);
    setInterval(() => {
      settleDueTPlusOneBatches().catch(error => {
        console.error("T+1 settlement job failed:", error.message);
      });
    }, 60 * 1000);

    const server = app.listen(PORT, () => {
      console.log(`Uniweb BVNK prototype running at http://localhost:${PORT}`);
      console.log(`Connected to MySQL database: ${process.env.DB_NAME || "uniweb_crytpo_payment"}`);
    });

    server.on("error", error => {
      if (error.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use. Change PORT in .env and restart the app.`);
      } else {
        console.error(error);
      }

      process.exit(1);
    });
  } catch (error) {
    console.error("Could not connect to MySQL. Check your .env settings and run database/schema.sql.");
    console.error(error.message);
    process.exit(1);
  }
}

startServer();
