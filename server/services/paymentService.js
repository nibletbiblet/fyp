import crypto from 'node:crypto'
import pool from '../config/db.js'
import { calculateCryptoAmount } from './paymentProviders/mockConversionProvider.js'

/**
 * Creates a new payment request in SGD.
 * @param {number} merchantId 
 * @param {number} amountSgd 
 * @param {string} description 
 * @returns {Promise<object>}
 */
export async function createPayment(merchantId, amountSgd, description) {
  const paymentId = crypto.randomUUID()
  const paymentReference = 'CF-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase()
  // Expires in 15 minutes
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

  const [result] = await pool.query(
    `INSERT INTO payments (
      payment_id, merchant_id, payment_reference, amount_sgd, description,
      status, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'CREATED', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [paymentId, merchantId, paymentReference, amountSgd, description || null, expiresAt]
  )

  // Write audit log
  await pool.query(
    `INSERT INTO audit_logs (payment_id, merchant_id, actor_type, action, details, created_at)
     VALUES (?, ?, 'MERCHANT', 'PAYMENT_CREATED', ?, CURRENT_TIMESTAMP)`,
    [paymentId, merchantId, JSON.stringify({ amountSgd, paymentReference })]
  )

  return { paymentId, paymentReference }
}

/**
 * Selects crypto and network for a payment, updates expected amount, fees, and generates QR.
 * @param {string} paymentId 
 * @param {string} cryptoSymbol 
 * @param {string} network 
 * @returns {Promise<object>}
 */
export async function selectCrypto(paymentId, cryptoSymbol, network) {
  const [payments] = await pool.query('SELECT * FROM payments WHERE payment_id = ?', [paymentId])
  if (payments.length === 0) {
    throw new Error('Payment not found')
  }
  const payment = payments[0]

  // Resolve supported_asset_id from the database
  const [assets] = await pool.query(
    `SELECT supported_asset_id, contract_address
     FROM supported_assets
     WHERE crypto_symbol = ? AND network = ? AND is_enabled = 1`,
    [cryptoSymbol, network]
  )
  if (assets.length === 0) {
    throw new Error(`Unsupported crypto currency or network combination: ${cryptoSymbol} on ${network}`)
  }
  const asset = assets[0]

  // Calculate rate and amount
  const { exchangeRate, cryptoAmount } = calculateCryptoAmount(payment.amount_sgd)

  // Generate mock receiving address
  let receivingAddress = ''
  if (cryptoSymbol === 'BTC') {
    receivingAddress = 'tb1' + crypto.randomBytes(20).toString('hex')
  } else {
    receivingAddress = '0x' + crypto.randomBytes(20).toString('hex')
  }

  // Generate standard QR code payload
  let qrCodeData = ''
  if (cryptoSymbol === 'BTC') {
    qrCodeData = `bitcoin:${receivingAddress}?amount=${cryptoAmount}&label=ChainForge&message=Order-${payment.payment_reference}`
  } else if (cryptoSymbol === 'ETH') {
    qrCodeData = `ethereum:${receivingAddress}?value=${cryptoAmount}`
  } else {
    // Stablecoin ERC-20 token info
    qrCodeData = JSON.stringify({
      token: cryptoSymbol,
      network: network,
      contract: asset.contract_address,
      recipient: receivingAddress,
      amount: cryptoAmount,
      reference: payment.payment_reference
    })
  }

  await pool.query(
    `UPDATE payments
     SET supported_asset_id = ?,
         crypto_symbol_snapshot = ?,
         network_snapshot = ?,
         expected_crypto_amount = ?,
         quoted_rate_sgd_per_crypto = ?,
         receiving_address = ?,
         qr_code_data = ?,
         status = 'AWAITING_PAYMENT',
         crypto_selected_at = CURRENT_TIMESTAMP
     WHERE payment_id = ?`,
    [
      asset.supported_asset_id,
      cryptoSymbol,
      network,
      cryptoAmount,
      exchangeRate,
      receivingAddress,
      qrCodeData,
      paymentId
    ]
  )

  // Audit log
  await pool.query(
    `INSERT INTO audit_logs (payment_id, merchant_id, actor_type, action, details, created_at)
     VALUES (?, ?, 'CUSTOMER', 'CRYPTO_SELECTED', ?, CURRENT_TIMESTAMP)`,
    [paymentId, payment.merchant_id, JSON.stringify({ cryptoSymbol, network, cryptoAmount, receivingAddress })]
  )

  return { success: true }
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
