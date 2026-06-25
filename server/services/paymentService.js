import crypto from 'node:crypto'
import QRCode from 'qrcode'
import { env } from '../config/env.js'
import pool from '../config/db.js'

const PAYMENT_REQUEST_TTL_MS = 24 * 60 * 60 * 1000
const QUOTE_TTL_MS = 15 * 60 * 1000

const assetRateById = {
  'asset-btc-testnet': env.mockPayments.btcSgdRate,
  'asset-eth-sepolia': env.mockPayments.ethSgdRate,
  'asset-stablecoin-sepolia': env.mockPayments.stablecoinSgdRate,
}

const addressByNetwork = {
  BTC_TESTNET: env.mockPayments.btcTestnetReceivingAddress,
  ETH_SEPOLIA: env.mockPayments.ethSepoliaReceivingAddress,
  STABLECOIN_SEPOLIA: env.mockPayments.stablecoinSepoliaReceivingAddress,
}

const toMysqlTimestamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ')

const roundCryptoAmount = (amount, decimals) => {
  const displayDecimals = Math.min(Number(decimals) || 18, 18)
  return Number(amount).toFixed(displayDecimals)
}

const buildQrPayload = ({ asset, payment, expectedCryptoAmount, receivingAddress }) => {
  if (asset.network === 'BTC_TESTNET') {
    return `bitcoin:${receivingAddress}?amount=${expectedCryptoAmount}&label=ChainForge&message=${payment.payment_reference}`
  }

  if (asset.network === 'ETH_SEPOLIA') {
    return `ethereum:${receivingAddress}@${asset.chain_id}?value=${expectedCryptoAmount}`
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
  merchantOrderReference,
  description,
  customerReference,
}) {
  const paymentId = crypto.randomUUID()
  const paymentReference = 'CF-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase()
  const expiresAt = new Date(Date.now() + PAYMENT_REQUEST_TTL_MS)
  const conn = await pool.getConnection()

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
        merchantOrderReference || null,
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
          merchantOrderReference: merchantOrderReference || null,
          customerReference: customerReference || null,
        }),
      ]
    )

    await conn.commit()
    return {
      paymentId,
      paymentReference,
      status: 'AWAITING_CRYPTO_SELECTION',
      amountSgd,
      checkoutUrl: `/checkout/${paymentId}`,
    }
  } catch (err) {
    await conn.rollback()
    throw err
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
       m.business_name AS merchant_name
     FROM payments p
     JOIN merchants m ON m.merchant_id = p.merchant_id
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
    const quotedRate = assetRateById[asset.supported_asset_id]
    if (!quotedRate || quotedRate <= 0) {
      throw Object.assign(new Error(`Mock quote rate is not configured for ${asset.supported_asset_id}`), { code: 'QUOTE_RATE_NOT_CONFIGURED' })
    }

    const expectedCryptoAmount = roundCryptoAmount(Number(payment.amount_sgd) / quotedRate, asset.decimals)
    const quoteExpiresAt = new Date(Date.now() + QUOTE_TTL_MS)
    const receivingAddress = addressByNetwork[asset.network]
    if (!receivingAddress) {
      throw Object.assign(new Error(`Mock receiving address is not configured for ${asset.network}`), { code: 'RECEIVING_ADDRESS_NOT_CONFIGURED' })
    }

    const qrCodeData = buildQrPayload({
      asset,
      payment,
      expectedCryptoAmount,
      receivingAddress,
    })
    const qrCodeImageDataUrl = await QRCode.toDataURL(qrCodeData, { margin: 1, width: 240 })
    const paymentInstructions = {
      qrCodeImageDataUrl,
      qrCodeData,
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
