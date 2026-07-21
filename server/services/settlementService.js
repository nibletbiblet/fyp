import crypto from 'node:crypto'
import pool from '../config/db.js'
import { calculateFees } from './paymentProviders/mockConversionProvider.js'

const PROVIDER_NAME = 'MOCK_MAS_LICENSED_PROVIDER'
const PAYOUT_FEE_SGD = 0.50

const providerReference = (prefix) => {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  return `${prefix}-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
}

export const insertSettlementAuditLog = async (
  conn,
  { paymentId, merchantId, settlementId = null, payoutId = null, blockchainTransactionId = null, action, details },
) => {
  await conn.query(
    `INSERT INTO audit_logs (
       payment_id, merchant_id, settlement_id, payout_id, blockchain_transaction_id,
       actor_type, action, details, created_at
     ) VALUES (?, ?, ?, ?, ?, 'SYSTEM', ?, ?, CURRENT_TIMESTAMP)`,
    [
      paymentId,
      merchantId,
      settlementId,
      payoutId,
      blockchainTransactionId,
      action,
      JSON.stringify(details),
    ],
  )
}

export async function createOrUpdateConvertedSettlement(conn, payment, { blockchainTransactionId = null } = {}) {
  const { processorFee, networkFee, netSettlementAmount } = calculateFees(Number(payment.amount_sgd))
  const [existing] = await conn.query(
    `SELECT settlement_id, provider_reference
     FROM settlements
     WHERE payment_id = ?
     LIMIT 1`,
    [payment.payment_id],
  )

  const settlementId = existing[0]?.settlement_id || crypto.randomUUID()
  const reference = existing[0]?.provider_reference || providerReference('TRIPLEA-SIM')

  if (existing.length > 0) {
    await conn.query(
      `UPDATE settlements
       SET gross_sgd_amount = ?,
           provider_fee_sgd = ?,
           platform_fee_sgd = ?,
           net_settlement_sgd_amount = ?,
           conversion_rate = ?,
           provider_name = ?,
           provider_reference = ?,
           status = CASE WHEN status IN ('PAID_OUT', 'SETTLED') THEN status ELSE 'CONVERTED_TO_SGD' END,
           converted_at = COALESCE(converted_at, CURRENT_TIMESTAMP)
       WHERE settlement_id = ?`,
      [
        payment.amount_sgd,
        processorFee,
        networkFee,
        netSettlementAmount,
        payment.quoted_rate_sgd_per_crypto,
        PROVIDER_NAME,
        reference,
        settlementId,
      ],
    )
  } else {
    await conn.query(
      `INSERT INTO settlements (
         settlement_id, payment_id, merchant_id, gross_sgd_amount,
         provider_fee_sgd, platform_fee_sgd, net_settlement_sgd_amount,
         conversion_rate, provider_name, provider_reference, status,
         converted_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONVERTED_TO_SGD',
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        settlementId,
        payment.payment_id,
        payment.merchant_id,
        payment.amount_sgd,
        processorFee,
        networkFee,
        netSettlementAmount,
        payment.quoted_rate_sgd_per_crypto,
        PROVIDER_NAME,
        reference,
      ],
    )
  }

  await conn.query(
    `UPDATE payments
     SET status = 'CONVERTED_TO_SGD',
         converted_at = COALESCE(converted_at, CURRENT_TIMESTAMP),
         provider_name = ?,
         provider_reference = ?
     WHERE payment_id = ?`,
    [PROVIDER_NAME, reference, payment.payment_id],
  )

  await insertSettlementAuditLog(conn, {
    paymentId: payment.payment_id,
    merchantId: payment.merchant_id,
    settlementId,
    blockchainTransactionId,
    action: 'CRYPTO_CONVERTED_TO_SGD',
    details: {
      provider: PROVIDER_NAME,
      providerReference: reference,
      rateSgdPerCrypto: payment.quoted_rate_sgd_per_crypto,
      grossSgdAmount: Number(payment.amount_sgd),
      providerFeeSgd: processorFee,
      platformFeeSgd: networkFee,
      netSettlementSgdAmount: netSettlementAmount,
      note: 'Simulated MAS-licensed provider conversion; no real fiat movement.',
    },
  })

  return {
    settlementId,
    providerReference: reference,
    processorFee,
    platformFee: networkFee,
    netSettlementAmount,
    status: 'CONVERTED_TO_SGD',
  }
}

export async function markConvertedSettlementsPending() {
  const [rows] = await pool.query(
    `SELECT s.*, p.payment_reference
     FROM settlements s
     JOIN payments p ON p.payment_id = s.payment_id
     WHERE s.status = 'CONVERTED_TO_SGD'`,
  )

  for (const settlement of rows) {
    await pool.query(
      `UPDATE settlements
       SET status = 'SETTLEMENT_PENDING'
       WHERE settlement_id = ? AND status = 'CONVERTED_TO_SGD'`,
      [settlement.settlement_id],
    )

    await insertSettlementAuditLog(pool, {
      paymentId: settlement.payment_id,
      merchantId: settlement.merchant_id,
      settlementId: settlement.settlement_id,
      action: 'SETTLEMENT_PENDING',
      details: {
        providerReference: settlement.provider_reference,
        note: 'Converted SGD is awaiting the next simulated merchant payout batch.',
      },
    })
  }
}

export async function createPayoutBatchesForPendingSettlements() {
  const [merchants] = await pool.query(
    `SELECT DISTINCT s.merchant_id, m.bank_name, m.account_last4
     FROM settlements s
     JOIN merchants m ON m.id = s.merchant_id
     WHERE s.status = 'SETTLEMENT_PENDING' AND s.payout_id IS NULL`,
  )

  for (const merchant of merchants) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const [settlements] = await conn.query(
        `SELECT settlement_id, payment_id, merchant_id, net_settlement_sgd_amount
         FROM settlements
         WHERE merchant_id = ? AND status = 'SETTLEMENT_PENDING' AND payout_id IS NULL
         FOR UPDATE`,
        [merchant.merchant_id],
      )

      if (settlements.length === 0) {
        await conn.commit()
        continue
      }

      const payoutId = crypto.randomUUID()
      const payoutReference = providerReference('PAYOUT-SIM')
      const grossPayout = settlements.reduce(
        (sum, settlement) => sum + Number(settlement.net_settlement_sgd_amount),
        0,
      )
      const netPayout = Number(Math.max(grossPayout - PAYOUT_FEE_SGD, 0).toFixed(2))

      await conn.query(
        `INSERT INTO merchant_payouts (
           payout_id, merchant_id, payout_reference, gross_sgd_amount,
           payout_fee_sgd, net_payout_sgd_amount, payout_method,
           bank_name, bank_account_last4, provider_name, provider_reference,
           status, requested_at, processing_started_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'BANK_TRANSFER_SIMULATED',
           ?, ?, ?, ?, 'PROCESSING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          payoutId,
          merchant.merchant_id,
          payoutReference,
          Number(grossPayout.toFixed(2)),
          PAYOUT_FEE_SGD,
          netPayout,
          merchant.bank_name,
          merchant.account_last4,
          PROVIDER_NAME,
          payoutReference,
        ],
      )

      await conn.query(
        `UPDATE settlements
         SET payout_id = ?,
             status = 'SETTLED',
             settled_at = COALESCE(settled_at, CURRENT_TIMESTAMP)
         WHERE merchant_id = ? AND status = 'SETTLEMENT_PENDING' AND payout_id IS NULL`,
        [payoutId, merchant.merchant_id],
      )

      await conn.query(
        `UPDATE payments p
         JOIN settlements s ON s.payment_id = p.payment_id
         SET p.status = 'SETTLED',
             p.settled_at = COALESCE(p.settled_at, CURRENT_TIMESTAMP)
         WHERE s.payout_id = ?`,
        [payoutId],
      )

      for (const settlement of settlements) {
        await insertSettlementAuditLog(conn, {
          paymentId: settlement.payment_id,
          merchantId: settlement.merchant_id,
          settlementId: settlement.settlement_id,
          payoutId,
          action: 'PAYMENT_SETTLED',
          details: {
            payoutReference,
            netSettlementSgdAmount: Number(settlement.net_settlement_sgd_amount),
            note: 'Settlement added to simulated merchant payout batch.',
          },
        })
      }

      await conn.commit()
    } catch (err) {
      await conn.rollback()
      console.error('Error creating payout batch:', err)
    } finally {
      conn.release()
    }
  }
}

export async function finalizeProcessingPayouts() {
  const [payouts] = await pool.query(
    `SELECT payout_id, merchant_id, payout_reference, net_payout_sgd_amount
     FROM merchant_payouts
     WHERE status = 'PROCESSING'
       AND processing_started_at <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 10 SECOND)`,
  )

  for (const payout of payouts) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      await conn.query(
        `UPDATE merchant_payouts
         SET status = 'PAID_OUT',
             paid_out_at = CURRENT_TIMESTAMP
         WHERE payout_id = ? AND status = 'PROCESSING'`,
        [payout.payout_id],
      )

      await conn.query(
        `UPDATE settlements
         SET status = 'PAID_OUT',
             paid_out_at = CURRENT_TIMESTAMP
         WHERE payout_id = ?`,
        [payout.payout_id],
      )

      await conn.query(
        `UPDATE payments p
         JOIN settlements s ON s.payment_id = p.payment_id
         SET p.status = 'PAID_OUT',
             p.paid_out_at = CURRENT_TIMESTAMP
         WHERE s.payout_id = ?`,
        [payout.payout_id],
      )

      const [settlements] = await conn.query(
        `SELECT settlement_id, payment_id, merchant_id
         FROM settlements
         WHERE payout_id = ?`,
        [payout.payout_id],
      )

      for (const settlement of settlements) {
        await insertSettlementAuditLog(conn, {
          paymentId: settlement.payment_id,
          merchantId: settlement.merchant_id,
          settlementId: settlement.settlement_id,
          payoutId: payout.payout_id,
          action: 'MERCHANT_PAYOUT_PAID_OUT',
          details: {
            payoutReference: payout.payout_reference,
            netPayoutSgdAmount: Number(payout.net_payout_sgd_amount),
            note: 'Simulated bank payout completed; no real fiat movement.',
          },
        })
      }

      await conn.commit()
    } catch (err) {
      await conn.rollback()
      console.error(`Error finalizing payout ${payout.payout_reference}:`, err)
    } finally {
      conn.release()
    }
  }
}
