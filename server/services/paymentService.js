import crypto from 'node:crypto'
import QRCode from 'qrcode'
import { env } from '../config/env.js'
import pool from '../config/db.js'
import { fetchEthSgdQuote } from './paymentProviders/coingeckoQuoteProvider.js'
import {
  getCurrentSepoliaBlockNumber,
  scanSepoliaEthPayment,
  toWeiString,
  verifySepoliaEthTransaction,
} from './paymentProviders/ethSepoliaProvider.js'
import { calculateFees } from './paymentProviders/mockConversionProvider.js'

const PAYMENT_REQUEST_TTL_MS = 24 * 60 * 60 * 1000
const ETH_SEPOLIA_ASSET_ID = 'asset-eth-sepolia'

const assetRateById = {
  'asset-btc-testnet': env.mockPayments.btcSgdRate,
  'asset-stablecoin-sepolia': env.mockPayments.stablecoinSgdRate,
}

const addressByNetwork = {
  BTC_TESTNET: env.mockPayments.btcTestnetReceivingAddress,
  ETH_SEPOLIA: env.sepolia.merchantReceivingAddress,
  STABLECOIN_SEPOLIA: env.mockPayments.stablecoinSepoliaReceivingAddress,
}

const toMysqlTimestamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ')
const buildQuoteExpiry = () => new Date(Date.now() + env.rateLockMinutes * 60 * 1000)
const isPast = (value) => value && new Date(value).getTime() <= Date.now()

const roundCryptoAmount = (amount, decimals) => {
  const displayDecimals = Math.min(Number(decimals) || 18, 18)
  return Number(amount).toFixed(displayDecimals)
}

const getQuoteForAsset = async (asset) => {
  if (asset.supported_asset_id === ETH_SEPOLIA_ASSET_ID) {
    const quote = await fetchEthSgdQuote()
    return {
      quotedRate: quote.rateSgdPerEth,
      quoteProvider: quote.provider,
      quoteFetchedAt: quote.fetchedAt,
    }
  }

  const quotedRate = assetRateById[asset.supported_asset_id]
  if (!quotedRate || quotedRate <= 0) {
    throw Object.assign(new Error(`Mock quote rate is not configured for ${asset.supported_asset_id}`), { code: 'QUOTE_RATE_NOT_CONFIGURED' })
  }

  return {
    quotedRate,
    quoteProvider: 'Mock static rate',
    quoteFetchedAt: new Date().toISOString(),
  }
}

const buildCheckoutUrl = (paymentId) => `/checkout/${paymentId}`
const buildAbsoluteCheckoutUrl = (paymentId) => `${env.corsOrigin.replace(/\/$/, '')}${buildCheckoutUrl(paymentId)}`

const buildMerchantOrderReference = () => {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, '')
  const randomPart = crypto.randomBytes(6).toString('hex').toUpperCase()
  return `PAY-${datePart}-${timePart}-${randomPart}`
}

const isDuplicateKeyError = (err) => err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062

const buildSepoliaEthPaymentUri = ({ receivingAddress, expectedCryptoAmount }) => {
  const cleanAddress = String(receivingAddress || '').trim()
  const weiValue = toWeiString(String(expectedCryptoAmount).trim())
  return `ethereum:${cleanAddress}@11155111?value=${weiValue}`
}

const buildWalletPaymentPayload = ({ asset, payment, expectedCryptoAmount, receivingAddress }) => {
  if (asset.network === 'BTC_TESTNET') {
    return `bitcoin:${receivingAddress}?amount=${expectedCryptoAmount}&label=ChainForge&message=${payment.payment_reference}`
  }

  if (asset.network === 'ETH_SEPOLIA') {
    return buildSepoliaEthPaymentUri({ receivingAddress, expectedCryptoAmount })
  }

  return JSON.stringify({
    token: asset.token_symbol,
    cryptoSymbol: asset.crypto_symbol,
    network: asset.network,
    chainId: asset.chain_id,
    contractAddress: asset.contract_address,
    recipient: receivingAddress,
    amount: expectedCryptoAmount,
    paymentReference: payment.payment_reference,
  })
}

/**
 * Creates a new payment request in SGD.
 * @returns {Promise<object>}
 */
export async function createPayment({
  merchantId,
  amountSgd,
  description,
  customerReference,
}) {
  const conn = await pool.getConnection()

  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const paymentId = crypto.randomUUID()
      const paymentReference = 'CF-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase()
      const merchantOrderReference = buildMerchantOrderReference()
      const expiresAt = new Date(Date.now() + PAYMENT_REQUEST_TTL_MS)

      try {
        await conn.beginTransaction()

        await conn.query(
          `INSERT INTO payments (
            payment_id, merchant_id, payment_reference, merchant_order_reference,
            description, customer_reference, amount_sgd, status, expires_at,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'AWAITING_CRYPTO_SELECTION', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            paymentId,
            merchantId,
            paymentReference,
            merchantOrderReference,
            description || null,
            customerReference || null,
            amountSgd,
            toMysqlTimestamp(expiresAt),
          ]
        )

        await conn.query(
          `INSERT INTO audit_logs (payment_id, merchant_id, actor_type, actor_id, action, details, created_at)
           VALUES (?, ?, 'MERCHANT', ?, 'PAYMENT_CREATED', ?, CURRENT_TIMESTAMP)`,
          [
            paymentId,
            merchantId,
            merchantId,
            JSON.stringify({
              amountSgd,
              paymentReference,
              merchantOrderReference,
              customerReference: customerReference || null,
            }),
          ]
        )

        await conn.commit()
        return {
          paymentId,
          paymentReference,
          merchantOrderReference,
          merchant_order_reference: merchantOrderReference,
          status: 'AWAITING_CRYPTO_SELECTION',
          amountSgd,
          checkoutUrl: buildCheckoutUrl(paymentId),
        }
      } catch (err) {
        await conn.rollback()
        if (isDuplicateKeyError(err) && attempt < 3) {
          continue
        }
        throw err
      }
    }

    throw Object.assign(new Error('Could not generate a unique payment reference'), {
      code: 'PAYMENT_REFERENCE_COLLISION',
    })
  } finally {
    conn.release()
  }
}

export async function getCheckoutDetails(paymentId) {
  const [payments] = await pool.query(
    `SELECT
       p.payment_id,
       p.payment_reference,
       p.merchant_order_reference,
       p.description,
       p.customer_reference,
       p.amount_sgd,
       p.supported_asset_id,
       p.crypto_symbol_snapshot,
       p.network_snapshot,
       p.expected_crypto_amount,
       p.received_crypto_amount,
       p.quoted_rate_sgd_per_crypto,
       p.quote_expires_at,
       p.amount_tolerance_bps,
       p.receiving_address,
       p.qr_code_data,
       p.payment_instructions,
       p.status,
       p.expires_at,
       p.crypto_selected_at,
       p.qr_generated_at,
       p.created_at,
       m.name AS merchant_name
     FROM payments p
     JOIN merchants m ON m.id = p.merchant_id
     WHERE p.payment_id = ?`,
    [paymentId]
  )

  if (payments.length === 0) {
    throw Object.assign(new Error('Payment not found'), { code: 'PAYMENT_NOT_FOUND' })
  }

  const [supportedAssets] = await pool.query(
    `SELECT
       supported_asset_id,
       crypto_symbol,
       network,
       asset_type,
       display_name,
       token_symbol,
       contract_address,
       chain_id,
       decimals,
       min_confirmations
     FROM supported_assets
     WHERE is_enabled = 1
     ORDER BY crypto_symbol, network`
  )

  return {
    payment: payments[0],
    supportedAssets,
  }
}

export async function selectAsset(paymentId, supportedAssetId) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [payments] = await conn.query(
      `SELECT *
       FROM payments
       WHERE payment_id = ?
       FOR UPDATE`,
      [paymentId]
    )

    if (payments.length === 0) {
      throw Object.assign(new Error('Payment not found'), { code: 'PAYMENT_NOT_FOUND' })
    }

    const payment = payments[0]
    if (!['CREATED', 'AWAITING_CRYPTO_SELECTION', 'QR_GENERATED', 'AWAITING_PAYMENT'].includes(payment.status)) {
      throw Object.assign(new Error(`Payment cannot select asset from status ${payment.status}`), { code: 'INVALID_PAYMENT_STATUS' })
    }

    const [assets] = await conn.query(
      `SELECT *
       FROM supported_assets
       WHERE supported_asset_id = ? AND is_enabled = 1`,
      [supportedAssetId]
    )

    if (assets.length === 0) {
      throw Object.assign(new Error('Supported asset not found'), { code: 'ASSET_NOT_FOUND' })
    }

    const asset = assets[0]
    const { quotedRate, quoteProvider, quoteFetchedAt } = await getQuoteForAsset(asset)

    const expectedCryptoAmount = roundCryptoAmount(Number(payment.amount_sgd) / quotedRate, asset.decimals)
    const quoteExpiresAt = buildQuoteExpiry()
    const receivingAddress = addressByNetwork[asset.network]
    if (!receivingAddress) {
      throw Object.assign(new Error(`Mock receiving address is not configured for ${asset.network}`), { code: 'RECEIVING_ADDRESS_NOT_CONFIGURED' })
    }

    const checkoutQrCodeData = buildAbsoluteCheckoutUrl(paymentId)
    const sepoliaCreatedBlockNumber = asset.supported_asset_id === ETH_SEPOLIA_ASSET_ID
      ? await getCurrentSepoliaBlockNumber()
      : null
    const walletPaymentQrCodeData = buildWalletPaymentPayload({
      asset,
      payment,
      expectedCryptoAmount,
      receivingAddress,
    })
    const qrCodeData = walletPaymentQrCodeData
    const qrCodeImageDataUrl = await QRCode.toDataURL(qrCodeData, { margin: 1, width: 240 })
    const checkoutQrCodeImageDataUrl = await QRCode.toDataURL(checkoutQrCodeData, { margin: 1, width: 240 })
    const paymentInstructions = {
      qrCodeImageDataUrl,
      qrCodeData,
      checkoutUrl: buildCheckoutUrl(paymentId),
      checkoutQrCodeData,
      checkoutQrCodeImageDataUrl,
      walletPaymentQrCodeData,
      eip681PaymentUri: asset.supported_asset_id === ETH_SEPOLIA_ASSET_ID ? walletPaymentQrCodeData : null,
      walletPaymentQrCodeImageDataUrl: qrCodeImageDataUrl,
      sepoliaCreatedBlockNumber,
      receivingAddress,
      expectedCryptoAmount,
      quoteExpiresAt: quoteExpiresAt.toISOString(),
      supportedAssetId: asset.supported_asset_id,
      cryptoSymbol: asset.crypto_symbol,
      network: asset.network,
      assetType: asset.asset_type,
      tokenSymbol: asset.token_symbol,
      contractAddress: asset.contract_address,
      chainId: asset.chain_id,
      minConfirmations: asset.min_confirmations,
      quoteProvider,
      quoteFetchedAt,
      tolerancePercent: env.paymentTolerancePercent,
      warning: 'Use testnet funds only and send on the selected network.',
    }

    await conn.query(
      `UPDATE payments
       SET supported_asset_id = ?,
           crypto_symbol_snapshot = ?,
           network_snapshot = ?,
           expected_crypto_amount = ?,
           quoted_rate_sgd_per_crypto = ?,
           quote_expires_at = ?,
           receiving_address = ?,
           qr_code_data = ?,
           payment_instructions = ?,
           status = 'AWAITING_PAYMENT',
           crypto_selected_at = CURRENT_TIMESTAMP,
           qr_generated_at = CURRENT_TIMESTAMP
       WHERE payment_id = ?`,
      [
        asset.supported_asset_id,
        asset.crypto_symbol,
        asset.network,
        expectedCryptoAmount,
        quotedRate,
        toMysqlTimestamp(quoteExpiresAt),
        receivingAddress,
        qrCodeData,
        JSON.stringify(paymentInstructions),
        paymentId,
      ]
    )

    await conn.query(
      `INSERT INTO audit_logs (payment_id, merchant_id, actor_type, action, details, created_at)
       VALUES (?, ?, 'CUSTOMER', 'PAYMENT_ASSET_SELECTED', ?, CURRENT_TIMESTAMP)`,
      [
        paymentId,
        payment.merchant_id,
        JSON.stringify({
          supportedAssetId: asset.supported_asset_id,
          cryptoSymbol: asset.crypto_symbol,
          network: asset.network,
          expectedCryptoAmount,
          quotedRate,
          quoteExpiresAt: quoteExpiresAt.toISOString(),
          quoteProvider,
          quoteFetchedAt,
          tolerancePercent: env.paymentTolerancePercent,
        }),
      ]
    )

    await conn.commit()
    return getCheckoutDetails(paymentId)
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

const buildVerificationErrorMessage = (status) => {
  const messages = {
    INVALID_TX_HASH: 'Transaction hash must be a 0x-prefixed 32-byte hash',
    TX_NOT_FOUND: 'Transaction was not found on Ethereum Sepolia',
    PENDING_CONFIRMATION: 'Transaction is still pending confirmation on Ethereum Sepolia',
    TX_FAILED: 'Transaction receipt shows a failed transaction',
    WRONG_RECEIVING_ADDRESS: 'Transaction was not sent to the configured merchant receiving address',
    UNDERPAID: 'Transaction amount is below the expected ETH amount after tolerance',
    EXPIRED: 'The payment or locked quote has expired',
    TX_ALREADY_USED: 'This transaction hash has already been used for another payment',
  }
  return messages[status] || 'Transaction verification failed'
}

const isOverpaidEthAmount = (receivedEthAmount, expectedEthAmount) => {
  try {
    return BigInt(toWeiString(receivedEthAmount)) > BigInt(toWeiString(expectedEthAmount))
  } catch {
    return false
  }
}

const parsePaymentInstructions = (value) => {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

const getPaymentForTxSubmission = async (paymentId) => {
  const [payments] = await pool.query(
    `SELECT
       p.*,
       sa.crypto_symbol,
       sa.network,
       sa.asset_type,
       sa.min_confirmations
     FROM payments p
     LEFT JOIN supported_assets sa ON sa.supported_asset_id = p.supported_asset_id
     WHERE p.payment_id = ?`,
    [paymentId]
  )

  if (payments.length === 0) {
    throw Object.assign(new Error('Payment not found'), { code: 'PAYMENT_NOT_FOUND' })
  }

  return payments[0]
}

const insertAuditLog = async (conn, { paymentId, merchantId, blockchainTransactionId = null, action, details }) => {
  await conn.query(
    `INSERT INTO audit_logs (
      payment_id, merchant_id, blockchain_transaction_id, actor_type, action, details, created_at
    ) VALUES (?, ?, ?, 'SYSTEM', ?, ?, CURRENT_TIMESTAMP)`,
    [paymentId, merchantId, blockchainTransactionId, action, JSON.stringify(details)]
  )
}

const upsertBlockchainTransaction = async (conn, { payment, txHash, verification, status }) => {
  if (!verification.transaction && !verification.txHash) {
    return null
  }

  const blockchainTransactionId = crypto.randomUUID()
  const tx = verification.transaction || {}
  const amountCrypto = verification.amountEth || '0'
  if (Number(amountCrypto) <= 0) {
    return null
  }

  await conn.query(
    `INSERT INTO blockchain_transactions (
      blockchain_transaction_id, payment_id, supported_asset_id,
      crypto_symbol_snapshot, network_snapshot, tx_hash,
      from_address, to_address, amount_crypto, confirmations, required_confirmations,
      block_number, status, raw_payload, detected_at, confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    ON DUPLICATE KEY UPDATE
      from_address = VALUES(from_address),
      to_address = VALUES(to_address),
      amount_crypto = VALUES(amount_crypto),
      confirmations = VALUES(confirmations),
      required_confirmations = VALUES(required_confirmations),
      block_number = VALUES(block_number),
      status = VALUES(status),
      raw_payload = VALUES(raw_payload),
      confirmed_at = VALUES(confirmed_at),
      updated_at = CURRENT_TIMESTAMP`,
    [
      blockchainTransactionId,
      payment.payment_id,
      payment.supported_asset_id,
      payment.crypto_symbol_snapshot || payment.crypto_symbol,
      payment.network_snapshot || payment.network,
      txHash,
      verification.fromAddress || tx.from || null,
      verification.toAddress || tx.to || payment.receiving_address,
      amountCrypto,
      verification.confirmations || 0,
      payment.min_confirmations || 1,
      verification.blockNumber || tx.blockNumber || null,
      status,
      JSON.stringify({ verification }),
      status === 'CONFIRMED' ? toMysqlTimestamp(new Date()) : null,
    ]
  )

  const [rows] = await conn.query(
    `SELECT blockchain_transaction_id
     FROM blockchain_transactions
     WHERE supported_asset_id = ? AND tx_hash = ? AND event_index = 0`,
    [payment.supported_asset_id, txHash]
  )

  return rows[0]?.blockchain_transaction_id || blockchainTransactionId
}

const createOrUpdateSimulatedSettlement = async (conn, payment) => {
  const [existing] = await conn.query(
    `SELECT settlement_id
     FROM settlements
     WHERE payment_id = ?`,
    [payment.payment_id]
  )

  const { processorFee, networkFee, netSettlementAmount } = calculateFees(Number(payment.amount_sgd))

  if (existing.length > 0) {
    await conn.query(
      `UPDATE settlements
       SET gross_sgd_amount = ?,
           provider_fee_sgd = ?,
           platform_fee_sgd = ?,
           net_settlement_sgd_amount = ?,
           conversion_rate = ?,
           status = 'SETTLED',
           converted_at = COALESCE(converted_at, CURRENT_TIMESTAMP),
           settled_at = COALESCE(settled_at, CURRENT_TIMESTAMP)
       WHERE settlement_id = ?`,
      [
        payment.amount_sgd,
        processorFee,
        networkFee,
        netSettlementAmount,
        payment.quoted_rate_sgd_per_crypto,
        existing[0].settlement_id,
      ]
    )
    return {
      settlementId: existing[0].settlement_id,
      processorFee,
      platformFee: networkFee,
      netSettlementAmount,
    }
  }

  const settlementId = crypto.randomUUID()
  await conn.query(
    `INSERT INTO settlements (
      settlement_id, payment_id, merchant_id, gross_sgd_amount,
      provider_fee_sgd, platform_fee_sgd, net_settlement_sgd_amount,
      conversion_rate, status, converted_at, settled_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SETTLED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      settlementId,
      payment.payment_id,
      payment.merchant_id,
      payment.amount_sgd,
      processorFee,
      networkFee,
      netSettlementAmount,
      payment.quoted_rate_sgd_per_crypto,
    ]
  )

  return {
    settlementId,
    processorFee,
    platformFee: networkFee,
    netSettlementAmount,
  }
}

export async function submitSepoliaTransactionHash(paymentId, txHash) {
  const payment = await getPaymentForTxSubmission(paymentId)

  if (payment.supported_asset_id !== ETH_SEPOLIA_ASSET_ID || payment.network !== 'ETH_SEPOLIA') {
    throw Object.assign(new Error('Only ETH Sepolia payments support manual transaction verification in this flow'), {
      code: 'UNSUPPORTED_PAYMENT_ASSET',
    })
  }

  if (!payment.expected_crypto_amount || !payment.receiving_address || !payment.quote_expires_at) {
    throw Object.assign(new Error('Payment has no active ETH Sepolia quote'), {
      code: 'PAYMENT_NOT_READY',
    })
  }

  if (isPast(payment.expires_at) || isPast(payment.quote_expires_at)) {
    await pool.query(
      `UPDATE payments
       SET status = 'EXPIRED'
       WHERE payment_id = ? AND status NOT IN ('SETTLED', 'PAID_OUT')`,
      [paymentId]
    )
    await pool.query(
      `INSERT INTO audit_logs (payment_id, merchant_id, actor_type, action, details, created_at)
       VALUES (?, ?, 'SYSTEM', 'PAYMENT_EXPIRED', ?, CURRENT_TIMESTAMP)`,
      [
        paymentId,
        payment.merchant_id,
        JSON.stringify({
          txHash: String(txHash || '').trim() || null,
          reason: 'Payment or locked quote expired before transaction verification',
        }),
      ]
    )
    return {
      status: 'EXPIRED',
      error: buildVerificationErrorMessage('EXPIRED'),
    }
  }

  const normalizedTxHash = String(txHash || '').trim()
  const [duplicateTxs] = await pool.query(
    `SELECT payment_id
     FROM blockchain_transactions
     WHERE tx_hash = ? AND payment_id <> ?
     LIMIT 1`,
    [normalizedTxHash, paymentId]
  )

  if (duplicateTxs.length > 0) {
    return {
      status: 'TX_ALREADY_USED',
      error: buildVerificationErrorMessage('TX_ALREADY_USED'),
    }
  }

  const verification = await verifySepoliaEthTransaction({
    txHash: normalizedTxHash,
    receivingAddress: env.sepolia.merchantReceivingAddress,
    expectedEthAmount: payment.expected_crypto_amount,
    tolerancePercent: env.paymentTolerancePercent,
    minConfirmations: payment.min_confirmations,
  })

  const nonConfirmedStatuses = [
    'INVALID_TX_HASH',
    'TX_NOT_FOUND',
    'PENDING_CONFIRMATION',
    'TX_FAILED',
    'WRONG_RECEIVING_ADDRESS',
    'UNDERPAID',
  ]

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [lockedPayments] = await conn.query(
      `SELECT
         p.*,
         sa.crypto_symbol,
         sa.network,
         sa.min_confirmations
       FROM payments p
       JOIN supported_assets sa ON sa.supported_asset_id = p.supported_asset_id
       WHERE p.payment_id = ?
       FOR UPDATE`,
      [paymentId]
    )

    if (lockedPayments.length === 0) {
      throw Object.assign(new Error('Payment not found'), { code: 'PAYMENT_NOT_FOUND' })
    }

    const lockedPayment = lockedPayments[0]
    const [duplicateTxs] = await conn.query(
      `SELECT payment_id
       FROM blockchain_transactions
       WHERE tx_hash = ? AND payment_id <> ?
       LIMIT 1`,
      [normalizedTxHash, paymentId]
    )

    if (duplicateTxs.length > 0) {
      await conn.commit()
      return {
        status: 'TX_ALREADY_USED',
        error: buildVerificationErrorMessage('TX_ALREADY_USED'),
      }
    }

    if (isPast(lockedPayment.expires_at) || isPast(lockedPayment.quote_expires_at)) {
      await conn.query(
        `UPDATE payments SET status = 'EXPIRED' WHERE payment_id = ?`,
        [paymentId]
      )
      await insertAuditLog(conn, {
        paymentId,
        merchantId: lockedPayment.merchant_id,
        action: 'PAYMENT_EXPIRED',
        details: { txHash: normalizedTxHash },
      })
      await conn.commit()
      return {
        status: 'EXPIRED',
        error: buildVerificationErrorMessage('EXPIRED'),
      }
    }

    const [samePaymentTxs] = await conn.query(
      `SELECT status
       FROM blockchain_transactions
       WHERE tx_hash = ? AND payment_id = ?
       LIMIT 1`,
      [normalizedTxHash, paymentId]
    )

    if (samePaymentTxs.length > 0 && samePaymentTxs[0].status === 'CONFIRMED' && lockedPayment.status === 'SETTLED') {
      await conn.commit()
      return {
        status: 'CONFIRMED',
        paymentStatus: lockedPayment.status,
      }
    }

    if (nonConfirmedStatuses.includes(verification.status)) {
      const txStatus = verification.status === 'PENDING_CONFIRMATION'
        ? 'CONFIRMING'
        : verification.status === 'UNDERPAID'
          ? 'FAILED'
          : 'IGNORED'

      const blockchainTransactionId = await upsertBlockchainTransaction(conn, {
        payment: lockedPayment,
        txHash: normalizedTxHash,
        verification,
        status: txStatus,
      })

      if (blockchainTransactionId) {
        await insertAuditLog(conn, {
          paymentId,
          merchantId: lockedPayment.merchant_id,
          blockchainTransactionId,
          action: 'PAYMENT_TX_DETECTED',
          details: {
            txHash: normalizedTxHash,
            verificationStatus: verification.status,
            amountEth: verification.amountEth || null,
          },
        })
      }

      if (verification.status === 'PENDING_CONFIRMATION') {
        await conn.query(
          `UPDATE payments
           SET status = 'CONFIRMING',
               payment_detected_at = COALESCE(payment_detected_at, CURRENT_TIMESTAMP)
           WHERE payment_id = ?`,
          [paymentId]
        )
      }

      if (verification.status === 'UNDERPAID') {
        await conn.query(
          `UPDATE payments
           SET status = 'UNDERPAID',
               received_crypto_amount = ?
           WHERE payment_id = ?`,
          [verification.amountEth || '0', paymentId]
        )
        await insertAuditLog(conn, {
          paymentId,
          merchantId: lockedPayment.merchant_id,
          blockchainTransactionId,
          action: 'PAYMENT_UNDERPAID',
          details: {
            txHash: normalizedTxHash,
            receivedEthAmount: verification.amountEth || null,
            expectedEthAmount: lockedPayment.expected_crypto_amount,
            requiredMinimumEth: verification.requiredMinimumEth || null,
          },
        })
      }

      await insertAuditLog(conn, {
        paymentId,
        merchantId: lockedPayment.merchant_id,
        blockchainTransactionId,
        action: 'PAYMENT_TX_VERIFICATION_FAILED',
        details: {
          txHash: normalizedTxHash,
          verificationStatus: verification.status,
          amountEth: verification.amountEth || null,
        },
      })

      await conn.commit()
      return {
        status: verification.status,
        error: buildVerificationErrorMessage(verification.status),
        verification,
      }
    }

    const blockchainTransactionId = await upsertBlockchainTransaction(conn, {
      payment: lockedPayment,
      txHash: normalizedTxHash,
      verification,
      status: 'CONFIRMED',
    })

    await insertAuditLog(conn, {
      paymentId,
      merchantId: lockedPayment.merchant_id,
      blockchainTransactionId,
      action: 'PAYMENT_TX_DETECTED',
      details: {
        txHash: normalizedTxHash,
        confirmations: verification.confirmations,
        amountEth: verification.amountEth,
      },
    })

    const overpaid = isOverpaidEthAmount(verification.amountEth, lockedPayment.expected_crypto_amount)
    if (overpaid) {
      await insertAuditLog(conn, {
        paymentId,
        merchantId: lockedPayment.merchant_id,
        blockchainTransactionId,
        action: 'PAYMENT_OVERPAID',
        details: {
          txHash: normalizedTxHash,
          receivedEthAmount: verification.amountEth,
          expectedEthAmount: lockedPayment.expected_crypto_amount,
        },
      })
    }

    await conn.query(
      `UPDATE payments
       SET status = 'CONFIRMED',
           received_crypto_amount = ?,
           payment_detected_at = COALESCE(payment_detected_at, CURRENT_TIMESTAMP),
           confirmed_at = CURRENT_TIMESTAMP
       WHERE payment_id = ?`,
      [verification.amountEth, paymentId]
    )

    await insertAuditLog(conn, {
      paymentId,
      merchantId: lockedPayment.merchant_id,
      blockchainTransactionId,
      action: 'PAYMENT_CONFIRMED',
      details: {
        txHash: normalizedTxHash,
        confirmations: verification.confirmations,
        amountEth: verification.amountEth,
      },
    })

    await conn.query(
      `UPDATE payments
       SET status = 'CONVERTED_TO_SGD',
           converted_at = CURRENT_TIMESTAMP
       WHERE payment_id = ?`,
      [paymentId]
    )

    await insertAuditLog(conn, {
      paymentId,
      merchantId: lockedPayment.merchant_id,
      blockchainTransactionId,
      action: 'CRYPTO_CONVERTED_TO_SGD',
      details: {
        provider: 'Self-simulated Sepolia ETH provider',
        rateSgdPerEth: lockedPayment.quoted_rate_sgd_per_crypto,
      },
    })

    const settlement = await createOrUpdateSimulatedSettlement(conn, lockedPayment)

    await conn.query(
      `UPDATE payments
       SET status = 'SETTLED',
           settled_at = CURRENT_TIMESTAMP
       WHERE payment_id = ?`,
      [paymentId]
    )

    await insertAuditLog(conn, {
      paymentId,
      merchantId: lockedPayment.merchant_id,
      blockchainTransactionId,
      action: 'PAYMENT_SETTLED',
      details: {
        settlementId: settlement.settlementId,
        grossSgdAmount: lockedPayment.amount_sgd,
        providerFeeSgd: settlement.processorFee,
        platformFeeSgd: settlement.platformFee,
        netSettlementSgdAmount: settlement.netSettlementAmount,
      },
    })

    await conn.commit()

    return {
      status: 'CONFIRMED',
      paymentStatus: 'SETTLED',
      txHash: normalizedTxHash,
      confirmations: verification.confirmations,
      amountEth: verification.amountEth,
      settlement,
    }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function detectSepoliaPayment(paymentId) {
  const payment = await getPaymentForTxSubmission(paymentId)

  if (payment.supported_asset_id !== ETH_SEPOLIA_ASSET_ID || payment.network !== 'ETH_SEPOLIA') {
    throw Object.assign(new Error('Only ETH Sepolia payments support auto detection in this flow'), {
      code: 'UNSUPPORTED_PAYMENT_ASSET',
    })
  }

  if (!payment.expected_crypto_amount || !payment.receiving_address || !payment.quote_expires_at) {
    throw Object.assign(new Error('Payment has no active ETH Sepolia quote'), {
      code: 'PAYMENT_NOT_READY',
    })
  }

  if (['SETTLED', 'PAID_OUT'].includes(payment.status)) {
    return {
      status: 'CONFIRMED',
      paymentStatus: payment.status,
      checkout: await getCheckoutDetails(paymentId),
    }
  }

  if (!['AWAITING_PAYMENT', 'PAYMENT_DETECTED', 'CONFIRMING', 'UNDERPAID'].includes(payment.status)) {
    return {
      status: payment.status,
      paymentStatus: payment.status,
      message: `Payment is not awaiting Sepolia payment detection from status ${payment.status}`,
    }
  }

  if (isPast(payment.expires_at) || isPast(payment.quote_expires_at)) {
    await pool.query(
      `UPDATE payments
       SET status = 'EXPIRED'
       WHERE payment_id = ? AND status NOT IN ('SETTLED', 'PAID_OUT')`,
      [paymentId]
    )
    return {
      status: 'EXPIRED',
      error: buildVerificationErrorMessage('EXPIRED'),
      checkout: await getCheckoutDetails(paymentId),
    }
  }

  const [usedTxs] = await pool.query(
    `SELECT tx_hash
     FROM blockchain_transactions
     WHERE payment_id <> ?`,
    [paymentId]
  )

  const instructions = parsePaymentInstructions(payment.payment_instructions)
  const scanResult = await scanSepoliaEthPayment({
    receivingAddress: env.sepolia.merchantReceivingAddress,
    expectedEthAmount: payment.expected_crypto_amount,
    tolerancePercent: env.paymentTolerancePercent,
    minConfirmations: payment.min_confirmations,
    fromBlock: instructions.sepoliaCreatedBlockNumber,
    ignoredTxHashes: usedTxs.map((row) => row.tx_hash),
  })

  if (scanResult.status !== 'FOUND') {
    return {
      status: 'NOT_DETECTED',
      paymentStatus: payment.status,
      ...scanResult,
    }
  }

  const verification = await submitSepoliaTransactionHash(paymentId, scanResult.txHash)

  return {
    status: verification.status,
    paymentStatus: verification.paymentStatus,
    transaction: {
      txHash: scanResult.txHash,
      fromAddress: scanResult.fromAddress,
      toAddress: scanResult.toAddress,
      amountEth: scanResult.amountEth,
      confirmations: scanResult.confirmations,
      blockNumber: scanResult.blockNumber,
    },
    settlement: verification.settlement || null,
    checkout: await getCheckoutDetails(paymentId),
  }
}

/**
 * Selects crypto and network for a payment, updates expected amount, fees, and generates QR.
 * @param {string} paymentId 
 * @param {string} cryptoSymbol 
 * @param {string} network 
 * @returns {Promise<object>}
 */
export async function selectCrypto(paymentId, cryptoSymbol, network) {
  const [assets] = await pool.query(
    `SELECT supported_asset_id
     FROM supported_assets
     WHERE crypto_symbol = ? AND network = ? AND is_enabled = 1`,
    [cryptoSymbol, network]
  )
  if (assets.length === 0) {
    throw new Error(`Unsupported crypto currency or network combination: ${cryptoSymbol} on ${network}`)
  }
  return selectAsset(paymentId, assets[0].supported_asset_id)
}

/**
 * Simulates transaction broadcast from customer wallet.
 * @param {string} paymentId 
 * @returns {Promise<object>}
 */
export async function simulatePaymentBroadcast(paymentId) {
  const [payments] = await pool.query(
    `SELECT p.*, sa.min_confirmations
     FROM payments p
     LEFT JOIN supported_assets sa ON sa.supported_asset_id = p.supported_asset_id
     WHERE p.payment_id = ?`,
    [paymentId]
  )
  if (payments.length === 0) {
    throw new Error('Payment not found')
  }
  const payment = payments[0]

  if (payment.status !== 'AWAITING_PAYMENT') {
    throw new Error(`Invalid payment status for simulation: ${payment.status}`)
  }

  const txHash = '0x' + crypto.randomBytes(32).toString('hex')
  const blockchainTransactionId = crypto.randomUUID()

  // Insert transaction
  await pool.query(
    `INSERT INTO blockchain_transactions (
      blockchain_transaction_id, payment_id, supported_asset_id,
      crypto_symbol_snapshot, network_snapshot, tx_hash,
      from_address, to_address, amount_crypto, confirmations, required_confirmations,
      status, detected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'DETECTED', CURRENT_TIMESTAMP)`,
    [
      blockchainTransactionId,
      paymentId,
      payment.supported_asset_id,
      payment.crypto_symbol_snapshot,
      payment.network_snapshot,
      txHash,
      '0x' + crypto.randomBytes(20).toString('hex'), // Mock sender
      payment.receiving_address,
      payment.expected_crypto_amount,
      payment.min_confirmations || 1
    ]
  )

  // Update payment status
  await pool.query(
    `UPDATE payments
     SET status = 'PAYMENT_DETECTED',
         payment_detected_at = CURRENT_TIMESTAMP
     WHERE payment_id = ?`,
    [paymentId]
  )

  // Audit log
  await pool.query(
    `INSERT INTO audit_logs (payment_id, merchant_id, actor_type, action, details, created_at)
     VALUES (?, ?, 'CUSTOMER', 'TRANSACTION_BROADCASTED', ?, CURRENT_TIMESTAMP)`,
    [paymentId, payment.merchant_id, JSON.stringify({ txHash, amountCrypto: payment.expected_crypto_amount })]
  )

  return { txHash }
}
