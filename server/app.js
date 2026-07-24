import cors from 'cors'
import express from 'express'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'
import { env } from './config/env.js'
import stripe from './config/stripe.js'
import pool from './config/db.js'
import { authenticateAdminToken, authenticateToken } from './middleware/auth.js'
import authRoutes from './routes/authRoutes.js'
import adminAuthRoutes from './routes/adminAuthRoutes.js'
import paymentRoutes from './routes/paymentRoutes.js'
import identityReviewRoutes from './routes/identityReviewRoutes.js'
import riskRoutes from './routes/riskRoutes.js'
import merchantStripeRoutes from './routes/merchantStripeRoutes.js'
import { startSettlementWorker } from './services/settlementWorker.js'
import { ensureKycSchema } from './services/identityReviewService.js'
import { ensureMainSchema } from './services/schemaService.js'
import { ensureRiskSchema } from './services/riskService.js'
import {
  handleStripeWebhookEvent,
  runDailyMerchantSettlements,
} from './services/settlementService.js'

export const app = express()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const identityReviewAssetDir = path.join(__dirname, 'admin-identity-review')
const adminDashboardAssetDir = path.join(__dirname, 'admin-dashboard')

app.use(cors({ origin: env.corsOrigin, credentials: true }))

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature']
    const event = env.stripe.webhookSecret
      ? stripe.webhooks.constructEvent(req.body, signature, env.stripe.webhookSecret)
      : JSON.parse(req.body.toString('utf8'))

    const result = await handleStripeWebhookEvent(event)
    res.json({ received: true, ...result })
  } catch (err) {
    console.error('Stripe webhook failed:', err)
    res.status(400).json({ error: err.message || 'Stripe webhook failed' })
  }
})

app.use(express.json())
app.use(cookieParser())

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'crypto-payment-platform-backend',
    environment: env.nodeEnv,
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/admin-auth', adminAuthRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/identity-review', identityReviewRoutes)
app.use('/api/kyc', identityReviewRoutes)
app.use('/api/risk', riskRoutes)
app.use('/api/merchant/stripe', merchantStripeRoutes)

const redirectToLogin = (res) => {
  const loginUrl = new URL('/login', env.corsOrigin)
  return res.redirect(loginUrl.toString())
}

const requireAdminPageLogin = (req, res, next) => {
  const token = req.cookies?.admin_token
  if (!token) return redirectToLogin(res)

  try {
    const payload = jwt.verify(token, env.jwtSecret)
    if (payload.tokenType !== 'admin' || !payload.adminUserId) return redirectToLogin(res)
    req.adminUserId = payload.adminUserId
    return next()
  } catch {
    return redirectToLogin(res)
  }
}

app.get('/admin-identity-review.html', requireAdminPageLogin, (_req, res) => {
  res.sendFile(path.join(identityReviewAssetDir, 'admin-identity-review.html'))
})

app.get('/identity-review.css', authenticateAdminToken, (_req, res) => {
  res.sendFile(path.join(identityReviewAssetDir, 'identity-review.css'))
})

app.get('/api/stripe/test', async (_req, res) => {
  try {
    const accounts = await stripe.accounts.list({ limit: 3 })

    res.json({
      success: true,
      message: 'Stripe Sandbox connection successful',
      connectedAccounts: accounts.data.map((account) => ({
        id: account.id,
        email: account.email,
        type: account.type,
      })),
    })
  } catch (error) {
    console.error('Stripe test failed:', error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

app.get('/identity-review.js', authenticateAdminToken, (_req, res) => {
  res.sendFile(path.join(identityReviewAssetDir, 'identity-review.js'))
})

app.get('/admin-dashboard.html', requireAdminPageLogin, (_req, res) => {
  res.sendFile(path.join(adminDashboardAssetDir, 'admin-dashboard.html'))
})

app.get('/admin-dashboard.css', authenticateAdminToken, (_req, res) => {
  res.sendFile(path.join(adminDashboardAssetDir, 'admin-dashboard.css'))
})

app.get('/admin-dashboard.js', authenticateAdminToken, (_req, res) => {
  res.sendFile(path.join(adminDashboardAssetDir, 'admin-dashboard.js'))
})

app.get('/api/admin-dashboard/overview', authenticateAdminToken, async (_req, res) => {
  try {
    const [[paymentStats], [conversionStats], [settlementStats], [payoutStats], [merchantStats], [riskStats]] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) AS total_payments,
           COALESCE(SUM(amount_sgd), 0) AS total_payment_volume,
           SUM(CASE WHEN status IN ('CONFIRMED', 'CONVERTED_TO_SGD', 'SETTLED', 'PAID_OUT') THEN 1 ELSE 0 END) AS confirmed_payments,
           SUM(CASE WHEN status IN ('FAILED', 'EXPIRED', 'MANUAL_REVIEW_REQUIRED') THEN 1 ELSE 0 END) AS failed_or_flagged
         FROM payments`
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_conversions,
           SUM(CASE WHEN status IN ('PENDING', 'CONVERSION_PROCESSING', 'RETURN_SUBMITTED') THEN 1 ELSE 0 END) AS pending_conversions,
           SUM(CASE WHEN status IN ('RETURN_CONFIRMED', 'CONVERTED') THEN 1 ELSE 0 END) AS completed_conversions
         FROM crypto_conversions`
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_settlements,
           COALESCE(SUM(net_settlement_sgd_amount), 0) AS total_settlement_value,
           SUM(CASE WHEN status IN ('CONVERTED_TO_SGD', 'SETTLEMENT_PENDING', 'ELIGIBLE', 'PROCESSING', 'HELD') THEN 1 ELSE 0 END) AS pending_settlements
         FROM settlements`
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_payouts,
           SUM(CASE WHEN status = 'PAID_OUT' THEN 1 ELSE 0 END) AS completed_payouts,
           COALESCE(SUM(net_payout_sgd_amount), 0) AS total_payout_value
         FROM merchant_payouts`
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_merchants,
           SUM(CASE WHEN status = 'ACTIVE_ONBOARDED' THEN 1 ELSE 0 END) AS active_merchants
         FROM merchants`
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_risk_assessments,
           SUM(CASE WHEN decision IN ('MANUAL_REVIEW', 'REJECT', 'KYC_REQUIRED') THEN 1 ELSE 0 END) AS flagged_risk
         FROM risk_assessments`
      ),
    ])

    const [paymentStatusRows] = await pool.query(
      `SELECT status, COUNT(*) AS count
       FROM payments
       GROUP BY status
       ORDER BY count DESC, status ASC`
    )

    const [recentPayments] = await pool.query(
      `SELECT
         p.payment_id,
         p.payment_reference,
         p.amount_sgd,
         p.expected_crypto_amount,
         p.received_crypto_amount,
         p.crypto_symbol_snapshot,
         p.network_snapshot,
         p.status,
         p.created_at,
         m.name AS merchant_name,
         bt.from_address AS customer_wallet,
         bt.tx_hash,
         r.risk_level,
         r.decision AS risk_decision
       FROM payments p
       JOIN merchants m ON m.id = p.merchant_id
       LEFT JOIN blockchain_transactions bt
         ON bt.blockchain_transaction_id = (
           SELECT bt2.blockchain_transaction_id
           FROM blockchain_transactions bt2
           WHERE bt2.payment_id = p.payment_id
           ORDER BY bt2.created_at DESC
           LIMIT 1
         )
       LEFT JOIN risk_assessments r
         ON r.risk_assessment_id = (
           SELECT r2.risk_assessment_id
           FROM risk_assessments r2
           WHERE r2.payment_id = p.payment_id
           ORDER BY r2.created_at DESC
           LIMIT 1
         )
       ORDER BY p.created_at DESC
       LIMIT 8`
    )

    const [recentPayouts] = await pool.query(
      `SELECT
         mp.payout_id,
         mp.payout_reference,
         mp.gross_sgd_amount,
         mp.payout_fee_sgd,
         mp.net_payout_sgd_amount,
         mp.status,
         mp.provider_reference,
         mp.stripe_transfer_id,
         mp.stripe_payout_id,
         mp.paid_out_at,
         mp.created_at,
         m.name AS merchant_name,
         (
           SELECT COUNT(*)
           FROM settlements s
           WHERE s.payout_id = mp.payout_id
         ) AS settlement_count
       FROM merchant_payouts mp
       JOIN merchants m ON m.id = mp.merchant_id
       ORDER BY mp.created_at DESC
       LIMIT 8`
    )

    const [recentSettlements] = await pool.query(
      `SELECT
         s.settlement_id,
         s.gross_sgd_amount,
         s.provider_fee_sgd,
         s.platform_fee_sgd,
         s.conversion_cost_sgd,
         s.network_fee_sgd,
         s.buffer_reserved_sgd,
         s.buffer_released_sgd,
         s.net_settlement_sgd_amount,
         s.status,
         s.provider_reference,
         s.created_at,
         s.converted_at,
         s.settled_at,
         s.paid_out_at,
         m.name AS merchant_name
       FROM settlements s
       JOIN merchants m ON m.id = s.merchant_id
       ORDER BY s.created_at DESC
       LIMIT 25`
    )

    const [recentConversions] = await pool.query(
      `SELECT
         cc.conversion_id,
         cc.payment_id,
         cc.crypto_currency,
         cc.crypto_amount,
         cc.quoted_fiat_amount,
         cc.quote_exchange_rate,
         cc.conversion_exchange_rate,
         cc.actual_fiat_proceeds,
         cc.conversion_gain_loss,
         cc.rate_source,
         cc.faucet_return_address,
         cc.faucet_return_tx_hash,
         cc.status,
         cc.converted_at,
         cc.created_at,
         p.payment_reference,
         m.name AS merchant_name
       FROM crypto_conversions cc
       JOIN payments p ON p.payment_id = cc.payment_id
       JOIN merchants m ON m.id = cc.merchant_id
       ORDER BY cc.created_at DESC
       LIMIT 25`
    )

    const [merchants] = await pool.query(
      `SELECT
         m.id AS merchant_id,
         m.name,
         m.email,
         m.status,
         m.kyc_status,
         m.payout_enabled,
         m.stripe_connected_account_id,
         m.created_at,
         COALESCE(SUM(p.amount_sgd), 0) AS total_transaction_value,
         COALESCE((
           SELECT SUM(mp.net_payout_sgd_amount)
           FROM merchant_payouts mp
           WHERE mp.merchant_id = m.id AND mp.status = 'PAID_OUT'
         ), 0) AS total_payouts
       FROM merchants m
       LEFT JOIN payments p ON p.merchant_id = m.id
       GROUP BY m.id
       ORDER BY m.created_at DESC
       LIMIT 25`
    )

    const [flaggedTransactions] = await pool.query(
      `SELECT
         r.risk_assessment_id,
         r.payment_id,
         r.wallet_address,
         r.score,
         r.risk_level,
         r.decision,
         r.reasons,
         r.created_at,
         p.payment_reference,
         p.amount_sgd,
         p.status AS payment_status,
         m.name AS merchant_name
       FROM risk_assessments r
       JOIN payments p ON p.payment_id = r.payment_id
       JOIN merchants m ON m.id = p.merchant_id
       WHERE r.decision IN ('MANUAL_REVIEW', 'REJECT', 'KYC_REQUIRED')
       ORDER BY r.created_at DESC
       LIMIT 8`
    )

    const [recentActivity] = await pool.query(
      `SELECT
         audit_log_id,
         merchant_id,
         payment_id,
         settlement_id,
         payout_id,
         action,
         details,
         created_at
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT 10`
    )

    res.json({
      stats: {
        totalPaymentVolume: Number(paymentStats[0]?.total_payment_volume || 0),
        confirmedPayments: Number(paymentStats[0]?.confirmed_payments || 0),
        pendingConversions: Number(conversionStats[0]?.pending_conversions || 0),
        completedConversions: Number(conversionStats[0]?.completed_conversions || 0),
        pendingSettlements: Number(settlementStats[0]?.pending_settlements || 0),
        completedPayouts: Number(payoutStats[0]?.completed_payouts || 0),
        totalPayments: Number(paymentStats[0]?.total_payments || 0),
        totalSettlementValue: Number(settlementStats[0]?.total_settlement_value || 0),
        totalPayouts: Number(payoutStats[0]?.total_payouts || 0),
        totalPayoutValue: Number(payoutStats[0]?.total_payout_value || 0),
        failedOrFlagged: Number(paymentStats[0]?.failed_or_flagged || 0) + Number(riskStats[0]?.flagged_risk || 0),
        activeMerchants: Number(merchantStats[0]?.active_merchants || 0),
        totalMerchants: Number(merchantStats[0]?.total_merchants || 0),
      },
      paymentStatuses: paymentStatusRows,
      recentPayments,
      recentConversions,
      recentSettlements,
      recentPayouts,
      merchants,
      flaggedTransactions,
      systemActivity: {
        settlementWorker: 'RUNNING',
        lastRefresh: new Date().toISOString(),
        recentActivity,
      },
    })
  } catch (err) {
    console.error('Fetch admin dashboard overview error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const [grossRow] = await pool.query(
      `SELECT COALESCE(SUM(gross_sgd_amount), 0) AS total_gross,
              COALESCE(SUM(platform_fee_sgd + COALESCE(NULLIF(conversion_cost_sgd, 0), provider_fee_sgd) + network_fee_sgd), 0) AS total_fees,
              COALESCE(SUM(net_settlement_sgd_amount), 0) AS total_net
       FROM settlements
       WHERE merchant_id = ? AND status IN ('TRANSFERRED', 'SETTLED', 'PAID_OUT')`,
      [req.merchantId]
    )

    const [countRow] = await pool.query(
      `SELECT
         COUNT(*) AS total_count,
         SUM(CASE WHEN status IN ('SETTLED', 'PAID_OUT') THEN 1 ELSE 0 END) AS settled_count,
         SUM(CASE WHEN status IN ('AWAITING_CRYPTO_SELECTION', 'AWAITING_PAYMENT', 'PAYMENT_DETECTED', 'CONFIRMING', 'CONFIRMED', 'CONVERTED_TO_SGD', 'KYC_REQUIRED', 'MANUAL_REVIEW_REQUIRED') THEN 1 ELSE 0 END) AS pending_count
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
        pendingCount: Number(countRow[0].pending_count),
      },
    })
  } catch (err) {
    console.error('Fetch stats error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.get('/api/dashboard/payments', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         p.*,
         s.net_settlement_sgd_amount,
         s.provider_fee_sgd,
         s.platform_fee_sgd,
         s.conversion_cost_sgd,
         s.network_fee_sgd,
         s.buffer_reserved_sgd,
         s.buffer_released_sgd,
         s.provider_reference AS settlement_provider_reference,
         s.status AS settlement_status,
         s.converted_at AS settlement_converted_at,
         s.settled_at AS settlement_settled_at,
         s.paid_out_at AS settlement_paid_out_at,
         mp.payout_reference,
         mp.payout_fee_sgd,
         mp.net_payout_sgd_amount,
         mp.status AS payout_status,
         mp.paid_out_at AS payout_paid_out_at,
         r.score AS risk_severity_value,
         r.risk_level,
         r.decision AS risk_decision
       FROM payments p
       LEFT JOIN settlements s ON s.payment_id = p.payment_id
       LEFT JOIN merchant_payouts mp ON mp.payout_id = s.payout_id
       LEFT JOIN risk_assessments r
         ON r.risk_assessment_id = (
           SELECT r2.risk_assessment_id
           FROM risk_assessments r2
           WHERE r2.payment_id = p.payment_id
           ORDER BY r2.created_at DESC
           LIMIT 1
         )
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

app.get('/api/dashboard/settlements', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         s.*,
         p.payment_reference,
         p.amount_sgd,
         p.crypto_symbol_snapshot,
         p.network_snapshot,
         p.expected_crypto_amount,
         p.received_crypto_amount,
         p.status AS payment_status,
         p.created_at AS payment_created_at,
         mp.payout_reference,
         mp.provider_reference AS payout_provider_reference,
         mp.status AS payout_status,
         mp.paid_out_at
       FROM settlements s
       JOIN payments p ON p.payment_id = s.payment_id
       LEFT JOIN merchant_payouts mp ON mp.payout_id = s.payout_id
       WHERE s.merchant_id = ? AND p.merchant_id = ?
       ORDER BY COALESCE(s.settled_at, s.converted_at, s.created_at) DESC`,
      [req.merchantId, req.merchantId]
    )
    res.json({ settlements: rows })
  } catch (err) {
    console.error('Fetch dashboard settlements error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const settlementJobAuth = (req, res, next) => {
  if (!env.settlementJobSecret) return next()

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : ''
  if (token && token === env.settlementJobSecret) return next()

  return res.status(401).json({ error: 'Unauthorized settlement job trigger' })
}

app.post('/api/settlements/run-t1', settlementJobAuth, async (req, res) => {
  try {
    const result = await runDailyMerchantSettlements({
      settlementDate: req.body?.settlementDate,
    })
    res.json({
      ok: true,
      settlementType: req.body?.settlementType || 'T_PLUS_1',
      trigger: req.body?.trigger || 'manual',
      ...result,
      processedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Run T+1 settlement error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

await ensureMainSchema()
await ensureRiskSchema()
await ensureKycSchema()
startSettlementWorker()
