import pool from '../config/db.js'
import {
  createOrUpdateConvertedSettlement,
  createPayoutBatchesForPendingSettlements,
  finalizeProcessingPayouts,
  insertSettlementAuditLog,
  markConvertedSettlementsPending,
} from './settlementService.js'

let intervalId = null

export function startSettlementWorker() {
  if (intervalId) return
  console.log('Settlement worker started; running every 5 seconds.')
  intervalId = setInterval(processPendingPayments, 5000)
}

export function stopSettlementWorker() {
  if (!intervalId) return
  clearInterval(intervalId)
  intervalId = null
  console.log('Settlement worker stopped.')
}

async function processPendingPayments() {
  try {
    await confirmDetectedTransactions()
    await convertConfirmedPayments()
    await markConvertedSettlementsPending()
    await createPayoutBatchesForPendingSettlements()
    await finalizeProcessingPayouts()
  } catch (err) {
    console.error('Error in settlement worker process:', err)
  }
}

async function confirmDetectedTransactions() {
  const [txs] = await pool.query(
    `SELECT bt.*, p.merchant_id, p.payment_reference
     FROM blockchain_transactions bt
     JOIN payments p ON p.payment_id = bt.payment_id
     WHERE bt.status IN ('DETECTED', 'CONFIRMING')`,
  )

  for (const tx of txs) {
    const nextConfirmations = Number(tx.confirmations || 0) + 1
    const requiredConfirmations = Number(tx.required_confirmations) || 1
    const isConfirmed = nextConfirmations >= requiredConfirmations

    if (isConfirmed) {
      await pool.query(
        `UPDATE blockchain_transactions
         SET confirmations = ?, status = 'CONFIRMED', confirmed_at = CURRENT_TIMESTAMP
         WHERE blockchain_transaction_id = ?`,
        [nextConfirmations, tx.blockchain_transaction_id],
      )

      await pool.query(
        `UPDATE payments
         SET status = 'CONFIRMED', confirmed_at = CURRENT_TIMESTAMP
         WHERE payment_id = ?`,
        [tx.payment_id],
      )

      await pool.query(
        `INSERT INTO audit_logs (payment_id, merchant_id, actor_type, action, details, created_at)
         VALUES (?, ?, 'SYSTEM', 'PAYMENT_CONFIRMED', ?, CURRENT_TIMESTAMP)`,
        [
          tx.payment_id,
          tx.merchant_id,
          JSON.stringify({ confirmations: nextConfirmations, requiredConfirmations }),
        ],
      )
      continue
    }

    await pool.query(
      `UPDATE blockchain_transactions
       SET confirmations = ?, status = 'CONFIRMING'
       WHERE blockchain_transaction_id = ?`,
      [nextConfirmations, tx.blockchain_transaction_id],
    )

    await pool.query(
      `UPDATE payments
       SET status = 'CONFIRMING'
       WHERE payment_id = ?`,
      [tx.payment_id],
    )
  }
}

async function convertConfirmedPayments() {
  const [payments] = await pool.query(
    `SELECT *
     FROM payments
     WHERE status = 'CONFIRMED'`,
  )

  for (const payment of payments) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const settlement = await createOrUpdateConvertedSettlement(conn, payment)
      await insertSettlementAuditLog(conn, {
        paymentId: payment.payment_id,
        merchantId: payment.merchant_id,
        settlementId: settlement.settlementId,
        action: 'SETTLEMENT_CREATED',
        details: {
          providerReference: settlement.providerReference,
          status: settlement.status,
        },
      })
      await conn.commit()
    } catch (err) {
      await conn.rollback()
      console.error(`Error converting payment ${payment.payment_reference}:`, err)
    } finally {
      conn.release()
    }
  }
}
