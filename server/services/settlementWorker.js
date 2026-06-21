import crypto from 'node:crypto'
import pool from '../config/db.js'
import { calculateFees } from './paymentProviders/mockConversionProvider.js'

let intervalId = null

/**
 * Starts the settlement background worker.
 */
export function startSettlementWorker() {
  if (intervalId) return
  console.log('🔄 Settlement Worker started (running every 5 seconds)...')
  intervalId = setInterval(processPendingPayments, 5000)
}

/**
 * Stops the settlement background worker.
 */
export function stopSettlementWorker() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('🛑 Settlement Worker stopped.')
  }
}

/**
 * Periodically advances the payment and settlement states.
 */
async function processPendingPayments() {
  try {
    // ═══════════════════════════════════════════════════════════════
    //  STAGE 1: Increment confirmations for DETECTED/CONFIRMING txs
    //  Each tick adds 1 confirmation. At 2+ confirmations → CONFIRMED.
    //  This means it takes 2 ticks (10s) to go from DETECTED→CONFIRMED.
    // ═══════════════════════════════════════════════════════════════
    const [txs] = await pool.query(
      `SELECT bt.*, p.merchant_id, p.amount_sgd, p.payment_reference
       FROM blockchain_transactions bt
       JOIN payments p ON p.payment_id = bt.payment_id
       WHERE bt.status IN ('DETECTED', 'CONFIRMING')`
    )

    for (const tx of txs) {
      const nextConfirmations = tx.confirmations + 1
      const isConfirmed = nextConfirmations >= 2

      if (isConfirmed) {
        // Mark blockchain tx and payment as CONFIRMED (only)
        await pool.query(
          `UPDATE blockchain_transactions
           SET confirmations = ?, status = 'CONFIRMED', confirmed_at = CURRENT_TIMESTAMP
           WHERE blockchain_transaction_id = ?`,
          [nextConfirmations, tx.blockchain_transaction_id]
        )

        await pool.query(
          `UPDATE payments
           SET status = 'CONFIRMED', confirmed_at = CURRENT_TIMESTAMP
           WHERE payment_id = ?`,
          [tx.payment_id]
        )

        await pool.query(
          `INSERT INTO audit_logs (payment_id, merchant_id, actor_type, action, details, created_at)
           VALUES (?, ?, 'SYSTEM', 'PAYMENT_CONFIRMED', ?, CURRENT_TIMESTAMP)`,
          [tx.payment_id, tx.merchant_id, JSON.stringify({ confirmations: nextConfirmations })]
        )

        console.log(`✅ Payment ${tx.payment_reference} confirmed (${nextConfirmations} confirmations)`)
      } else {
        // Increment confirmation count and set status to CONFIRMING
        await pool.query(
          `UPDATE blockchain_transactions
           SET confirmations = ?, status = 'CONFIRMING'
           WHERE blockchain_transaction_id = ?`,
          [nextConfirmations, tx.blockchain_transaction_id]
        )

        await pool.query(
          `UPDATE payments
           SET status = 'CONFIRMING'
           WHERE payment_id = ?`,
          [tx.payment_id]
        )

        console.log(`⏳ Payment ${tx.payment_reference} confirmations: ${nextConfirmations}/2`)
      }
    }

    // ═══════════════════════════════════════════════════════════════
    //  STAGE 2: Convert CONFIRMED payments → CONVERTED_TO_SGD
    //  Simulates MAS-licensed provider (e.g. Triple-A) converting
    //  crypto to SGD. Happens one tick after CONFIRMED.
    // ═══════════════════════════════════════════════════════════════
    const [confirmedPayments] = await pool.query(
      `SELECT p.payment_id, p.merchant_id, p.payment_reference
       FROM payments p
       WHERE p.status = 'CONFIRMED'`
    )

    for (const cp of confirmedPayments) {
      await pool.query(
        `UPDATE payments
         SET status = 'CONVERTED_TO_SGD', converted_at = CURRENT_TIMESTAMP
         WHERE payment_id = ?`,
        [cp.payment_id]
      )

      await pool.query(
        `INSERT INTO audit_logs (payment_id, merchant_id, actor_type, action, details, created_at)
         VALUES (?, ?, 'SYSTEM', 'CRYPTO_CONVERTED_TO_SGD', ?, CURRENT_TIMESTAMP)`,
        [cp.payment_id, cp.merchant_id, JSON.stringify({ provider: 'Triple-A (simulated)' })]
      )

      console.log(`💱 Payment ${cp.payment_reference} converted to SGD`)
    }

    // ═══════════════════════════════════════════════════════════════
    //  STAGE 3: Settle CONVERTED_TO_SGD payments → SETTLED
    //  Creates the settlement record, calculates fees, and marks
    //  the payment as fully settled. Happens one tick after conversion.
    // ═══════════════════════════════════════════════════════════════
    const [convertedPayments] = await pool.query(
      `SELECT p.payment_id, p.merchant_id, p.amount_sgd, p.payment_reference
       FROM payments p
       WHERE p.status = 'CONVERTED_TO_SGD'`
    )

    for (const cp of convertedPayments) {
      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()

        const { processorFee, networkFee, netSettlementAmount } = calculateFees(cp.amount_sgd)
        const settlementId = crypto.randomUUID()

        // Insert settlement record
        await conn.query(
          `INSERT INTO settlements (
            settlement_id, payment_id, merchant_id, gross_sgd_amount,
            provider_fee_sgd, platform_fee_sgd, net_settlement_sgd_amount,
            status, settled_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SETTLED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            settlementId,
            cp.payment_id,
            cp.merchant_id,
            cp.amount_sgd,
            processorFee,
            networkFee,
            netSettlementAmount
          ]
        )

        // Update payment to SETTLED
        await conn.query(
          `UPDATE payments
           SET status = 'SETTLED', settled_at = CURRENT_TIMESTAMP
           WHERE payment_id = ?`,
          [cp.payment_id]
        )

        // Audit log
        await conn.query(
          `INSERT INTO audit_logs (payment_id, merchant_id, actor_type, action, details, created_at)
           VALUES (?, ?, 'SYSTEM', 'PAYMENT_SETTLED', ?, CURRENT_TIMESTAMP)`,
          [
            cp.payment_id,
            cp.merchant_id,
            JSON.stringify({
              gross: cp.amount_sgd,
              fees: processorFee + networkFee,
              net: netSettlementAmount,
              settlementId
            })
          ]
        )

        await conn.commit()
        console.log(`🏦 Payment ${cp.payment_reference} fully settled. Net payout: S$${netSettlementAmount}`)
      } catch (err) {
        await conn.rollback()
        console.error(`Error settling payment ${cp.payment_reference}:`, err)
      } finally {
        conn.release()
      }
    }
  } catch (err) {
    console.error('Error in settlement worker process:', err)
  }
}
