import crypto from 'node:crypto'
import pool from '../config/db.js'
import stripe from '../config/stripe.js'
import { calculateFees } from './paymentProviders/mockConversionProvider.js'
import { isStripePayoutSetupComplete } from './stripeConnectService.js'

const PROVIDER_NAME = 'MOCK_MAS_LICENSED_PROVIDER'
const ZERO_PAYOUT_FEE_SGD = 0

const toSgdCents = (amount) => Math.round(Number(amount || 0) * 100)
const fromSgdCents = (amountCents) => Number((amountCents / 100).toFixed(2))

const providerReference = (prefix) => {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  return `${prefix}-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
}

export const getSingaporeDateString = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

export const getPreviousSingaporeDateString = () =>
  getSingaporeDateString(new Date(Date.now() - 24 * 60 * 60 * 1000))

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
  const {
    platformFee,
    conversionCost,
    networkFee,
    bufferReserved,
    bufferReleased,
    chargedDeduction,
    netSettlementAmount,
  } = calculateFees(Number(payment.amount_sgd))
  const [existing] = await conn.query(
    `SELECT settlement_id, provider_reference
     FROM settlements
     WHERE payment_id = ?
     LIMIT 1`,
    [payment.payment_id],
  )

  const settlementId = existing[0]?.settlement_id || crypto.randomUUID()
  const reference = existing[0]?.provider_reference || providerReference('CHAINFORGE-SIM')

  if (existing.length > 0) {
    await conn.query(
      `UPDATE settlements
       SET gross_sgd_amount = ?,
           provider_fee_sgd = ?,
           platform_fee_sgd = ?,
           conversion_cost_sgd = ?,
           network_fee_sgd = ?,
           buffer_reserved_sgd = ?,
           buffer_released_sgd = ?,
           net_settlement_sgd_amount = ?,
           conversion_rate = ?,
           provider_name = ?,
           provider_reference = ?,
           status = CASE WHEN status IN ('PAID_OUT', 'TRANSFERRED', 'SETTLED') THEN status ELSE 'CONVERTED_TO_SGD' END,
           converted_at = COALESCE(converted_at, CURRENT_TIMESTAMP)
       WHERE settlement_id = ?`,
      [
        payment.amount_sgd,
        conversionCost,
        platformFee,
        conversionCost,
        networkFee,
        bufferReserved,
        bufferReleased,
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
         conversion_cost_sgd, network_fee_sgd, buffer_reserved_sgd,
         buffer_released_sgd, conversion_rate, provider_name, provider_reference, status,
         converted_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONVERTED_TO_SGD',
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        settlementId,
        payment.payment_id,
        payment.merchant_id,
        payment.amount_sgd,
        conversionCost,
        platformFee,
        netSettlementAmount,
        conversionCost,
        networkFee,
        bufferReserved,
        bufferReleased,
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
      platformFeeSgd: platformFee,
      conversionCostSgd: conversionCost,
      networkFeeSgd: networkFee,
      bufferReservedSgd: bufferReserved,
      bufferReleasedSgd: bufferReleased,
      chargedDeductionSgd: chargedDeduction,
      netSettlementSgdAmount: netSettlementAmount,
      note: 'Simulated ETH-to-SGD conversion; unused MDR buffer is released to the merchant.',
    },
  })

  return {
    settlementId,
    providerReference: reference,
    processorFee: platformFee,
    platformFee,
    conversionCost,
    networkFee,
    bufferReserved,
    bufferReleased,
    netSettlementAmount,
    status: 'CONVERTED_TO_SGD',
  }
}

export async function markConvertedSettlementsPending(settlementDate = getPreviousSingaporeDateString()) {
  const [rows] = await pool.query(
    `SELECT s.*, p.payment_reference
     FROM settlements s
     JOIN payments p ON p.payment_id = s.payment_id
     WHERE s.status = 'CONVERTED_TO_SGD'
       AND DATE(DATE_ADD(COALESCE(s.converted_at, s.created_at), INTERVAL 8 HOUR)) <= ?`,
    [settlementDate],
  )

  for (const settlement of rows) {
    await pool.query(
      `UPDATE settlements
       SET status = 'ELIGIBLE'
       WHERE settlement_id = ? AND status = 'CONVERTED_TO_SGD'`,
      [settlement.settlement_id],
    )

    await insertSettlementAuditLog(pool, {
      paymentId: settlement.payment_id,
      merchantId: settlement.merchant_id,
      settlementId: settlement.settlement_id,
      action: 'SETTLEMENT_ELIGIBLE_T_PLUS_1',
      details: {
        providerReference: settlement.provider_reference,
        settlementDate,
        note: 'Converted SGD is eligible for the daily T+1 Stripe transfer run.',
      },
    })
  }

  return rows.length
}

export async function createPayoutBatchesForPendingSettlements(settlementDate = getPreviousSingaporeDateString()) {
  const [merchants] = await pool.query(
    `SELECT DISTINCT
       s.merchant_id,
       m.bank_name,
       m.account_last4,
       m.stripe_connected_account_id,
       m.stripe_details_submitted,
       m.stripe_payouts_enabled,
       m.stripe_requirements_currently_due,
       m.stripe_requirements_disabled_reason,
       COALESCE(mfp.platform_fee_rate, 0.015000) AS platform_fee_rate,
       COALESCE(mfp.maximum_total_rate, 0.030000) AS maximum_total_rate
     FROM settlements s
     JOIN merchants m ON m.id = s.merchant_id
     LEFT JOIN merchant_fee_profiles mfp ON mfp.merchant_id = m.id
     WHERE s.status IN ('ELIGIBLE', 'SETTLEMENT_PENDING') AND s.payout_id IS NULL
       AND DATE(DATE_ADD(COALESCE(s.converted_at, s.created_at), INTERVAL 8 HOUR)) <= ?`,
    [settlementDate],
  )

  const results = []

  for (const merchant of merchants) {
    const conn = await pool.getConnection()
    let attemptedBatch = null
    try {
      await conn.beginTransaction()

      const [settlements] = await conn.query(
        `SELECT
           settlement_id,
           payment_id,
           merchant_id,
           gross_sgd_amount,
           provider_fee_sgd,
           platform_fee_sgd,
           conversion_cost_sgd,
           network_fee_sgd,
           buffer_reserved_sgd,
           buffer_released_sgd,
           net_settlement_sgd_amount
         FROM settlements
         WHERE merchant_id = ?
           AND status IN ('ELIGIBLE', 'SETTLEMENT_PENDING')
           AND payout_id IS NULL
           AND DATE(DATE_ADD(COALESCE(converted_at, created_at), INTERVAL 8 HOUR)) <= ?
         FOR UPDATE`,
        [merchant.merchant_id, settlementDate],
      )

      if (settlements.length === 0) {
        await conn.commit()
        continue
      }

      if (!isStripePayoutSetupComplete(merchant)) {
        const grossCents = settlements.reduce((sum, settlement) => sum + toSgdCents(settlement.gross_sgd_amount), 0)
        const maximumDeductionCents = Math.round(grossCents * Number(merchant.maximum_total_rate || 0.03))
        const batchResult = await conn.query(
          `INSERT INTO settlement_batches (
             merchant_id, settlement_date, gross_amount_cents, platform_fee_cents,
             conversion_cost_cents, network_fee_cents, buffer_reserved_cents,
             buffer_released_cents, absorbed_by_chainforge_cents, net_amount_cents,
             status, failure_reason
           ) VALUES (?, ?, ?, 0, 0, 0, ?, 0, 0, 0, 'HELD', 'Stripe payout setup incomplete')
           ON DUPLICATE KEY UPDATE
             status = 'HELD',
             failure_reason = VALUES(failure_reason),
             gross_amount_cents = VALUES(gross_amount_cents),
             buffer_reserved_cents = VALUES(buffer_reserved_cents)`,
          [merchant.merchant_id, settlementDate, grossCents, maximumDeductionCents],
        )

        await conn.query(
          `UPDATE settlements
           SET status = 'HELD',
               failure_reason = 'Stripe payout setup incomplete'
           WHERE merchant_id = ?
             AND status IN ('ELIGIBLE', 'SETTLEMENT_PENDING')
             AND payout_id IS NULL
             AND DATE(DATE_ADD(COALESCE(converted_at, created_at), INTERVAL 8 HOUR)) <= ?`,
          [merchant.merchant_id, settlementDate],
        )

        for (const settlement of settlements) {
          await insertSettlementAuditLog(conn, {
            paymentId: settlement.payment_id,
            merchantId: settlement.merchant_id,
            settlementId: settlement.settlement_id,
            action: 'SETTLEMENT_HELD_PAYOUT_SETUP_INCOMPLETE',
            details: {
              stripeConnectedAccountId: merchant.stripe_connected_account_id,
              detailsSubmitted: Boolean(merchant.stripe_details_submitted),
              payoutsEnabled: Boolean(merchant.stripe_payouts_enabled),
              disabledReason: merchant.stripe_requirements_disabled_reason || null,
              settlementDate,
              note: 'Merchant must complete Stripe Sandbox payout setup before T+1 transfer.',
            },
          })
        }

        await conn.commit()
        results.push({
          merchantId: merchant.merchant_id,
          batchId: batchResult[0]?.insertId || null,
          status: 'HELD',
          settlementCount: settlements.length,
          reason: 'Stripe payout setup incomplete',
        })
        continue
      }

      const payoutId = crypto.randomUUID()
      const payoutReference = providerReference('STRIPE-TRANSFER')
      const idempotencyKey = `settlement-${merchant.merchant_id}-${settlementDate}`
      const grossCents = settlements.reduce((sum, settlement) => sum + toSgdCents(settlement.gross_sgd_amount), 0)
      const platformFeeCents = Math.round(grossCents * Number(merchant.platform_fee_rate || 0.015))
      const conversionCostCents = settlements.reduce((sum, settlement) => {
        const explicit = toSgdCents(settlement.conversion_cost_sgd)
        return sum + (explicit > 0 ? explicit : toSgdCents(settlement.provider_fee_sgd))
      }, 0)
      const networkFeeCents = settlements.reduce((sum, settlement) => sum + toSgdCents(settlement.network_fee_sgd), 0)
      const maximumDeductionCents = Math.round(grossCents * Number(merchant.maximum_total_rate || 0.03))
      const actualDeductionCents = platformFeeCents + conversionCostCents + networkFeeCents
      const chargedDeductionCents = Math.min(actualDeductionCents, maximumDeductionCents)
      const absorbedByChainForgeCents = Math.max(0, actualDeductionCents - maximumDeductionCents)
      const bufferReservedCents = Math.max(0, maximumDeductionCents - platformFeeCents)
      const bufferReleasedCents = Math.max(0, maximumDeductionCents - chargedDeductionCents)
      const netPayoutCents = grossCents - chargedDeductionCents

      if (netPayoutCents <= 0) {
        throw new Error('Net settlement amount must be greater than zero')
      }

      const [existingBatches] = await conn.query(
        `SELECT id, status, stripe_transfer_id
         FROM settlement_batches
         WHERE merchant_id = ? AND settlement_date = ?
         FOR UPDATE`,
        [merchant.merchant_id, settlementDate],
      )

      if (existingBatches[0]?.status === 'TRANSFERRED') {
        await conn.commit()
        results.push({
          merchantId: merchant.merchant_id,
          batchId: existingBatches[0].id,
          status: 'TRANSFERRED',
          stripeTransferId: existingBatches[0].stripe_transfer_id,
          note: 'Settlement batch already transferred.',
        })
        continue
      }

      await conn.query(
        `INSERT INTO settlement_batches (
           merchant_id, settlement_date, gross_amount_cents, platform_fee_cents,
           conversion_cost_cents, network_fee_cents, buffer_reserved_cents,
           buffer_released_cents, absorbed_by_chainforge_cents, net_amount_cents,
           status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING')
         ON DUPLICATE KEY UPDATE
           gross_amount_cents = VALUES(gross_amount_cents),
           platform_fee_cents = VALUES(platform_fee_cents),
           conversion_cost_cents = VALUES(conversion_cost_cents),
           network_fee_cents = VALUES(network_fee_cents),
           buffer_reserved_cents = VALUES(buffer_reserved_cents),
           buffer_released_cents = VALUES(buffer_released_cents),
           absorbed_by_chainforge_cents = VALUES(absorbed_by_chainforge_cents),
           net_amount_cents = VALUES(net_amount_cents),
           status = 'PROCESSING',
           failure_reason = NULL`,
        [
          merchant.merchant_id,
          settlementDate,
          grossCents,
          platformFeeCents,
          conversionCostCents,
          networkFeeCents,
          bufferReservedCents,
          bufferReleasedCents,
          absorbedByChainForgeCents,
          netPayoutCents,
        ],
      )

      const [batchRows] = await conn.query(
        `SELECT id FROM settlement_batches WHERE merchant_id = ? AND settlement_date = ? LIMIT 1`,
        [merchant.merchant_id, settlementDate],
      )
      const batchId = batchRows[0].id
      attemptedBatch = {
        grossCents,
        platformFeeCents,
        conversionCostCents,
        networkFeeCents,
        bufferReservedCents,
        bufferReleasedCents,
        absorbedByChainForgeCents,
        netPayoutCents,
      }

      await conn.query(
         `UPDATE settlements
         SET status = 'PROCESSING'
         WHERE merchant_id = ?
           AND status IN ('ELIGIBLE', 'SETTLEMENT_PENDING')
           AND payout_id IS NULL
           AND DATE(DATE_ADD(COALESCE(converted_at, created_at), INTERVAL 8 HOUR)) <= ?`,
        [merchant.merchant_id, settlementDate],
      )

      const transfer = await stripe.transfers.create(
        {
          amount: netPayoutCents,
          currency: 'sgd',
          destination: merchant.stripe_connected_account_id,
          transfer_group: `SETTLEMENT_${merchant.merchant_id}_${settlementDate}`,
          metadata: {
            merchantId: String(merchant.merchant_id),
            settlementDate,
            grossAmountCents: String(grossCents),
            platformFeeCents: String(platformFeeCents),
            conversionCostCents: String(conversionCostCents),
            networkFeeCents: String(networkFeeCents),
            bufferReleasedCents: String(bufferReleasedCents),
            settlementBatchId: String(batchId),
            netPayoutCents: String(netPayoutCents),
          },
        },
        { idempotencyKey },
      )

      await conn.query(
        `INSERT INTO merchant_payouts (
           payout_id, merchant_id, payout_reference, gross_sgd_amount,
           payout_fee_sgd, net_payout_sgd_amount, payout_method,
           bank_name, bank_account_last4, provider_name, provider_reference,
           stripe_transfer_id, idempotency_key, status,
           requested_at, processing_started_at, paid_out_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'BANK_TRANSFER_SIMULATED',
           ?, ?, ?, ?, ?, ?, 'TRANSFERRED',
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          payoutId,
          merchant.merchant_id,
          payoutReference,
          fromSgdCents(grossCents),
          ZERO_PAYOUT_FEE_SGD,
          fromSgdCents(netPayoutCents),
          merchant.bank_name,
          merchant.account_last4,
          'STRIPE_CONNECT_SANDBOX',
          transfer.id,
          transfer.id,
          idempotencyKey,
        ],
      )

      await conn.query(
        `UPDATE settlement_batches
         SET stripe_transfer_id = ?,
             status = 'TRANSFERRED',
             completed_at = CURRENT_TIMESTAMP,
             failure_reason = NULL
         WHERE id = ?`,
        [transfer.id, batchId],
      )

      await conn.query(
        `UPDATE settlements
         SET payout_id = ?,
             status = 'TRANSFERRED',
             settled_at = COALESCE(settled_at, CURRENT_TIMESTAMP)
         WHERE merchant_id = ?
           AND status = 'PROCESSING'
           AND payout_id IS NULL
           AND DATE(DATE_ADD(COALESCE(converted_at, created_at), INTERVAL 8 HOUR)) <= ?`,
        [payoutId, merchant.merchant_id, settlementDate],
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
            stripeTransferId: transfer.id,
            settlementBatchId: batchId,
            settlementDate,
            netSettlementSgdAmount: Number(settlement.net_settlement_sgd_amount),
            note: 'T+1 Stripe Sandbox transfer created using capped fair MDR.',
          },
        })
      }

      await conn.commit()
      results.push({
        merchantId: merchant.merchant_id,
        status: 'TRANSFERRED',
        batchId,
        payoutId,
        stripeTransferId: transfer.id,
        settlementCount: settlements.length,
        grossSgd: fromSgdCents(grossCents),
        platformFeeSgd: fromSgdCents(platformFeeCents),
        conversionCostSgd: fromSgdCents(conversionCostCents),
        networkFeeSgd: fromSgdCents(networkFeeCents),
        bufferReleasedSgd: fromSgdCents(bufferReleasedCents),
        absorbedByChainForgeSgd: fromSgdCents(absorbedByChainForgeCents),
        netPayoutSgd: fromSgdCents(netPayoutCents),
      })
    } catch (err) {
      await conn.rollback()
      if (attemptedBatch) {
        await pool.query(
          `INSERT INTO settlement_batches (
             merchant_id, settlement_date, gross_amount_cents, platform_fee_cents,
             conversion_cost_cents, network_fee_cents, buffer_reserved_cents,
             buffer_released_cents, absorbed_by_chainforge_cents, net_amount_cents,
             status, failure_reason
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FAILED', ?)
           ON DUPLICATE KEY UPDATE
             status = 'FAILED',
             failure_reason = VALUES(failure_reason),
             gross_amount_cents = VALUES(gross_amount_cents),
             platform_fee_cents = VALUES(platform_fee_cents),
             conversion_cost_cents = VALUES(conversion_cost_cents),
             network_fee_cents = VALUES(network_fee_cents),
             buffer_reserved_cents = VALUES(buffer_reserved_cents),
             buffer_released_cents = VALUES(buffer_released_cents),
             absorbed_by_chainforge_cents = VALUES(absorbed_by_chainforge_cents),
             net_amount_cents = VALUES(net_amount_cents)`,
          [
            merchant.merchant_id,
            settlementDate,
            attemptedBatch.grossCents,
            attemptedBatch.platformFeeCents,
            attemptedBatch.conversionCostCents,
            attemptedBatch.networkFeeCents,
            attemptedBatch.bufferReservedCents,
            attemptedBatch.bufferReleasedCents,
            attemptedBatch.absorbedByChainForgeCents,
            attemptedBatch.netPayoutCents,
            err.message,
          ],
        )
      }
      console.error('Error creating payout batch:', err)
      results.push({
        merchantId: merchant.merchant_id,
        status: 'FAILED',
        error: err.message,
      })
    } finally {
      conn.release()
    }
  }

  return results
}

export async function finalizeProcessingPayouts() {
  return []
}

export async function runDailyMerchantSettlements({ settlementDate = getPreviousSingaporeDateString() } = {}) {
  const eligibleCount = await markConvertedSettlementsPending(settlementDate)
  const transfers = await createPayoutBatchesForPendingSettlements(settlementDate)

  return {
    settlementDate,
    eligibleCount,
    transfers,
  }
}

export async function handleStripeWebhookEvent(event) {
  if (event.type === 'account.updated') {
    const account = event.data.object
    const requirements = account.requirements || {}
    const currentlyDue = requirements.currently_due || []
    const disabledReason = requirements.disabled_reason || null
    const detailsSubmitted = account.details_submitted ? 1 : 0
    const payoutsEnabled = account.payouts_enabled ? 1 : 0
    const chargesEnabled = account.charges_enabled ? 1 : 0
    const onboardingStatus = detailsSubmitted && payoutsEnabled && currentlyDue.length === 0 && !disabledReason
      ? 'COMPLETE'
      : detailsSubmitted || disabledReason
        ? 'RESTRICTED'
        : 'INCOMPLETE'

    const [result] = await pool.query(
      `UPDATE merchants
       SET stripe_details_submitted = ?,
           stripe_payouts_enabled = ?,
           stripe_charges_enabled = ?,
           stripe_requirements_currently_due = ?,
           stripe_requirements_disabled_reason = ?,
           stripe_onboarding_status = ?,
           stripe_status_synced_at = CURRENT_TIMESTAMP
       WHERE stripe_connected_account_id = ?`,
      [
        detailsSubmitted,
        payoutsEnabled,
        chargesEnabled,
        JSON.stringify(currentlyDue),
        disabledReason,
        onboardingStatus,
        account.id,
      ],
    )

    return { handled: true, type: event.type, updatedMerchants: result.affectedRows || 0 }
  }

  if (event.type === 'payout.paid' || event.type === 'payout.failed') {
    const payout = event.data.object
    const stripeAccountId = event.account || payout.account || null
    if (!stripeAccountId) return { handled: false, type: event.type, reason: 'No connected account on payout event' }

    const status = event.type === 'payout.paid' ? 'PAID_OUT' : 'FAILED'
    const failureReason = event.type === 'payout.failed'
      ? payout.failure_message || payout.failure_code || 'Stripe payout failed'
      : null

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [merchants] = await conn.query(
        `SELECT id FROM merchants WHERE stripe_connected_account_id = ? LIMIT 1 FOR UPDATE`,
        [stripeAccountId],
      )
      if (merchants.length === 0) {
        await conn.rollback()
        return { handled: false, type: event.type, reason: 'No merchant matched connected account' }
      }

      const merchantId = merchants[0].id
      await conn.query(
        `UPDATE settlement_batches
         SET status = ?,
             failure_reason = ?,
             completed_at = CASE WHEN ? = 'PAID_OUT' THEN CURRENT_TIMESTAMP ELSE completed_at END
         WHERE merchant_id = ? AND status = 'TRANSFERRED'`,
        [status, failureReason, status, merchantId],
      )

      await conn.query(
        `UPDATE merchant_payouts
         SET status = ?,
             stripe_payout_id = COALESCE(stripe_payout_id, ?),
             paid_out_at = CASE WHEN ? = 'PAID_OUT' THEN CURRENT_TIMESTAMP ELSE paid_out_at END,
             failed_at = CASE WHEN ? = 'FAILED' THEN CURRENT_TIMESTAMP ELSE failed_at END,
             failure_reason = ?
         WHERE merchant_id = ? AND status = 'TRANSFERRED'`,
        [status, payout.id, status, status, failureReason, merchantId],
      )

      await conn.query(
        `UPDATE settlements s
         JOIN merchant_payouts mp ON mp.payout_id = s.payout_id
         SET s.status = ?,
             s.paid_out_at = CASE WHEN ? = 'PAID_OUT' THEN CURRENT_TIMESTAMP ELSE s.paid_out_at END,
             s.failed_at = CASE WHEN ? = 'FAILED' THEN CURRENT_TIMESTAMP ELSE s.failed_at END,
             s.failure_reason = ?
         WHERE s.merchant_id = ? AND s.status = 'TRANSFERRED'`,
        [status, status, status, failureReason, merchantId],
      )

      await conn.query(
        `UPDATE payments p
         JOIN settlements s ON s.payment_id = p.payment_id
         SET p.status = ?,
             p.paid_out_at = CASE WHEN ? = 'PAID_OUT' THEN CURRENT_TIMESTAMP ELSE p.paid_out_at END
         WHERE p.merchant_id = ? AND s.status = ?`,
        [status, status, merchantId, status],
      )

      await conn.commit()
      return { handled: true, type: event.type, merchantId, status }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  }

  return { handled: false, type: event.type }
}
