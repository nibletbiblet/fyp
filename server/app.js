import crypto from 'node:crypto'
import cors from 'cors'
import express from 'express'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import pool from './config/db.js'
import { createToken, authenticateToken } from './middleware/auth.js'
import { hashPassword, verifyPassword, getUserByEmail } from './utils/auth.js'

export const app = express()

app.use(cors({ origin: env.corsOrigin, credentials: true }))
app.use(express.json())
app.use(cookieParser())

// ── Health check ──
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'crypto-payment-platform-backend',
    environment: env.nodeEnv,
  })
})

// ══════════════════════════════════════════════════════════════
//  POST /api/auth/register
//  Registers a new merchant + merchant_user.
//
//  Schema targets:
//    merchants:      id, name, email, bank_name, account_holder_name,
//                    account_last4, bank_account_label (UEN), status
//    merchant_users: id, merchant_id (FK), email, password_hash,
//                    password_salt, full_name
// ══════════════════════════════════════════════════════════════
app.post('/api/auth/register', async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { name, email, password, uen, bankName, accountHolderName, accountNo } = req.body

    // ── Input validation ──
    if (!name || !email || !password || !uen || !bankName || !accountHolderName || !accountNo) {
      return res.status(400).json({ error: 'All fields are required: name, email, password, uen, bankName, accountHolderName, accountNo' })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    // UEN format validation (Singapore: 8–9 digits + 1 letter, or other accepted formats)
    if (!/^\d{8,9}[A-Z]$/.test(uen)) {
      return res.status(400).json({ error: 'Invalid UEN format. Expected 8-9 digits followed by a capital letter (e.g. 53912345M)' })
    }

    // ── Uniqueness check ──
    const [dupEmail] = await conn.query(
      'SELECT id FROM merchants WHERE email = ?',
      [email]
    )
    if (dupEmail.length > 0) {
      return res.status(409).json({ error: 'A merchant with this email already exists' })
    }

    const [dupUen] = await conn.query(
      'SELECT id FROM merchants WHERE bank_account_label = ?',
      [uen]
    )
    if (dupUen.length > 0) {
      return res.status(409).json({ error: 'A merchant with this UEN already exists' })
    }

    // ── Hash password using crypto.pbkdf2Sync ──
    const { hash: passwordHash, salt: passwordSalt } = hashPassword(password)

    // ── Derive last-4 of account number ──
    const accountLast4 = accountNo.slice(-4)

    // ── Begin transaction: insert merchant + merchant_user ──
    await conn.beginTransaction()

    // Insert into merchants table
    // status defaults to 'ACTIVE_UNVERIFIED'
    const [merchantResult] = await conn.query(
      `INSERT INTO merchants (name, email, bank_name, account_holder_name, account_last4, bank_account_label, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE_UNVERIFIED')`,
      [name, email, bankName, accountHolderName, accountLast4, uen]
    )
    const merchantId = merchantResult.insertId

    // Insert into merchant_users table
    await conn.query(
      `INSERT INTO merchant_users (merchant_id, email, password_hash, password_salt, full_name)
       VALUES (?, ?, ?, ?, ?)`,
      [merchantId, email, passwordHash, passwordSalt, accountHolderName]
    )

    await conn.commit()

    // ── Console.log mock activation link ──
    const activationLink = `http://localhost:3001/verify-email?merchantId=${merchantId}`
    console.log(`\n📧 [MOCK EMAIL] Activation link for "${name}":`)
    console.log(`   ${activationLink}\n`)

    res.status(201).json({
      message: 'Merchant registered successfully',
      merchantId,
      // For the frontend prototype: return the verification URL so the UI can simulate clicking it
      verificationUrl: `/verify-email?merchantId=${merchantId}`,
    })
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error('Registration error:', err)
    res.status(500).json({ error: 'Internal server error during registration' })
  } finally {
    conn.release()
  }
})

// ══════════════════════════════════════════════════════════════
//  GET /api/auth/verify-email?merchantId=<id>
//  Simulates clicking the email verification link.
//
//  Generates mock Triple-A container + wallet IDs and flips
//  merchant status → 'ACTIVE_ONBOARDED' inside a strict ACID
//  transaction (BEGIN → COMMIT / ROLLBACK).
// ══════════════════════════════════════════════════════════════
app.get('/api/auth/verify-email', async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { merchantId } = req.query

    if (!merchantId) {
      return res.status(400).json({ error: 'merchantId query parameter is required' })
    }

    await conn.beginTransaction()

    // ── Look up the merchant ──
    const [rows] = await conn.query(
      'SELECT id, name, status FROM merchants WHERE id = ?',
      [merchantId]
    )
    if (rows.length === 0) {
      await conn.rollback()
      return res.status(404).json({ error: 'Merchant not found' })
    }

    const merchant = rows[0]

    // Already onboarded?
    if (merchant.status === 'ACTIVE_ONBOARDED') {
      await conn.rollback()
      return res.json({
        message: 'Merchant already verified and onboarded',
        merchantId: merchant.id,
        alreadyVerified: true,
      })
    }

    // ── Mint mock Triple-A infrastructure IDs ──
    const tripleaMerchantId = `ta_merch_${crypto.randomBytes(12).toString('hex')}`
    const tripleaWalletId = `ta_wall_${crypto.randomBytes(12).toString('hex')}`

    // ── Atomic update: provision infrastructure + flip status ──
    await conn.query(
      `UPDATE merchants
       SET status = 'ACTIVE_ONBOARDED',
           triplea_merchant_id = ?,
           triplea_wallet_id = ?
       WHERE id = ?`,
      [tripleaMerchantId, tripleaWalletId, merchant.id]
    )

    await conn.commit()

    console.log(`✅ Merchant "${merchant.name}" (ID ${merchant.id}) verified and onboarded.`)
    console.log(`   Triple-A Container: ${tripleaMerchantId}`)
    console.log(`   Triple-A Wallet:    ${tripleaWalletId}\n`)

    res.json({
      message: 'Infrastructure provisioned successfully',
      merchantId: merchant.id,
      containerId: tripleaMerchantId,
      walletId: tripleaWalletId,
    })
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error('Verification error:', err)
    res.status(500).json({ error: 'Internal server error during verification' })
  } finally {
    conn.release()
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/auth/login
//  Authenticates using getUserByEmail + verifyPassword helpers.
//  Returns a JWT token on success.
// ══════════════════════════════════════════════════════════════
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // ── Look up the user by email (joins merchant_users + merchants) ──
    const user = await getUserByEmail(pool, email)
    if (!user) {
      // Run a dummy hash to prevent timing leakage
      hashPassword(password)
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // ── Verify password using crypto.pbkdf2Sync timing-safe comparison ──
    const isValid = verifyPassword(password, user.password_hash, user.password_salt)
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // ── Issue JWT ──
    const token = createToken(user.merchant_id)

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // set to true in production
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    })

    res.json({
      message: 'Login successful',
      token,
      merchant: {
        merchantId: user.merchant_id,
        email: user.email,
        businessName: user.merchant_name,
        status: user.merchant_status,
      },
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Internal server error during login' })
  }
})

// ══════════════════════════════════════════════════════════════
//  GET /api/auth/me
//  Returns the authenticated merchant's profile.
// ══════════════════════════════════════════════════════════════
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.id AS merchant_id, m.name AS business_name, m.email,
              m.bank_name, m.account_holder_name, m.account_last4,
              m.bank_account_label AS uen, m.status,
              m.triplea_merchant_id AS container_id,
              m.triplea_wallet_id  AS wallet_id,
              m.created_at
       FROM merchants m
       WHERE m.id = ?`,
      [req.merchantId]
    )
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Merchant not found' })
    }
    res.json({ merchant: rows[0] })
  } catch (err) {
    console.error('Profile error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/auth/resend-verification
//  Returns a new mock verification URL.
// ══════════════════════════════════════════════════════════════
app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const [rows] = await pool.query(
      "SELECT id, name FROM merchants WHERE email = ? AND status = 'ACTIVE_UNVERIFIED'",
      [email]
    )
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No unverified account found for this email' })
    }

    const merchant = rows[0]
    const activationLink = `http://localhost:3001/verify-email?merchantId=${merchant.id}`
    console.log(`\n📧 [MOCK EMAIL RESEND] Activation link for "${merchant.name}":`)
    console.log(`   ${activationLink}\n`)

    res.json({
      message: 'Verification link resent',
      verificationUrl: `/verify-email?merchantId=${merchant.id}`,
    })
  } catch (err) {
    console.error('Resend verification error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/auth/logout
//  Clears the auth cookie.
// ══════════════════════════════════════════════════════════════
app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('token')
  res.json({ message: 'Logged out successfully' })
})

// ══════════════════════════════════════════════════════════════
//  POST /api/payments
//  Creates a new payment request (protected).
// ══════════════════════════════════════════════════════════════
import { createPayment, selectCrypto, simulatePaymentBroadcast } from './services/paymentService.js'

app.post('/api/payments', authenticateToken, async (req, res) => {
  try {
    const { amountSgd, description } = req.body

    if (!amountSgd || isNaN(amountSgd) || Number(amountSgd) <= 0) {
      return res.status(400).json({ error: 'Valid amount in SGD is required' })
    }

    const { paymentId, paymentReference } = await createPayment(req.merchantId, Number(amountSgd), description)

    res.status(201).json({
      message: 'Payment created successfully',
      paymentId,
      paymentReference,
      checkoutUrl: `/checkout/${paymentId}`
    })
  } catch (err) {
    console.error('Create payment error:', err)
    res.status(500).json({ error: 'Internal server error during payment creation' })
  }
})

// ══════════════════════════════════════════════════════════════
//  GET /api/payments/:id
//  Gets payment + blockchain transactions (public).
// ══════════════════════════════════════════════════════════════
app.get('/api/payments/:id', async (req, res) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query(
      `SELECT p.*, m.name AS merchant_name, m.email AS merchant_email
       FROM payments p
       JOIN merchants m ON m.id = p.merchant_id
       WHERE p.payment_id = ?`,
      [id]
    )
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' })
    }

    const [txs] = await pool.query(
      `SELECT * FROM blockchain_transactions WHERE payment_id = ? ORDER BY detected_at DESC`,
      [id]
    )

    res.json({ payment: rows[0], transactions: txs })
  } catch (err) {
    console.error('Fetch payment error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/payments/:id/select-crypto
//  Selects network and crypto, generates receiving address & QR.
// ══════════════════════════════════════════════════════════════
app.post('/api/payments/:id/select-crypto', async (req, res) => {
  try {
    const { id } = req.params
    const { cryptoSymbol, network } = req.body

    if (!cryptoSymbol || !network) {
      return res.status(400).json({ error: 'cryptoSymbol and network are required' })
    }

    await selectCrypto(id, cryptoSymbol, network)
    res.json({ message: 'Crypto selection updated successfully' })
  } catch (err) {
    console.error('Select crypto error:', err)
    res.status(500).json({ error: err.message || 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/payments/:id/simulate-pay
//  Simulates blockchain broadcast.
// ══════════════════════════════════════════════════════════════
app.post('/api/payments/:id/simulate-pay', async (req, res) => {
  try {
    const { id } = req.params
    const { txHash } = await simulatePaymentBroadcast(id)
    res.json({ message: 'Mock payment transaction broadcasted', txHash })
  } catch (err) {
    console.error('Simulation error:', err)
    res.status(500).json({ error: err.message || 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════
//  GET /api/dashboard/stats
//  Returns aggregates metrics for stats cards (protected).
// ══════════════════════════════════════════════════════════════
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const [grossRow] = await pool.query(
      `SELECT COALESCE(SUM(gross_sgd_amount), 0) AS total_gross,
              COALESCE(SUM(provider_fee_sgd + platform_fee_sgd), 0) AS total_fees,
              COALESCE(SUM(net_settlement_sgd_amount), 0) AS total_net
       FROM settlements
       WHERE merchant_id = ?`,
      [req.merchantId]
    )

    const [countRow] = await pool.query(
      `SELECT
         COUNT(*) AS total_count,
         SUM(CASE WHEN status = 'SETTLED' THEN 1 ELSE 0 END) AS settled_count,
         SUM(CASE WHEN status = 'AWAITING_PAYMENT' OR status = 'PAYMENT_DETECTED' OR status = 'CONFIRMING' THEN 1 ELSE 0 END) AS pending_count
       FROM payments
       WHERE merchant_id = ?`,
      [req.merchantId]
    )

    res.json({
      stats: {
        totalGross: Number(grossRow[0].total_gross),
        totalFees: Number(grossRow[0].total_fees),
        totalNet: Number(grossRow[0].total_net),
        totalCount: Number(countRow[0].total_count),
        settledCount: Number(countRow[0].settled_count),
        pendingCount: Number(countRow[0].pending_count)
      }
    })
  } catch (err) {
    console.error('Fetch stats error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════
//  GET /api/dashboard/payments
//  Returns payments list (protected).
// ══════════════════════════════════════════════════════════════
app.get('/api/dashboard/payments', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, s.net_settlement_sgd_amount, s.provider_fee_sgd, s.platform_fee_sgd
       FROM payments p
       LEFT JOIN settlements s ON s.payment_id = p.payment_id
       WHERE p.merchant_id = ?
       ORDER BY p.created_at DESC`,
      [req.merchantId]
    )
    res.json({ payments: rows })
  } catch (err) {
    console.error('Fetch dashboard payments error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Start the background settlement worker ──
import { startSettlementWorker } from './services/settlementWorker.js'
startSettlementWorker()

