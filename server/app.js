import cors from 'cors'
import express from 'express'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import pool from './config/db.js'
import { authenticateToken } from './middleware/auth.js'
import authRoutes from './routes/authRoutes.js'
import paymentRoutes from './routes/paymentRoutes.js'
import identityReviewRoutes from './routes/identityReviewRoutes.js'
import riskRoutes from './routes/riskRoutes.js'
import { startSettlementWorker } from './services/settlementWorker.js'
import { ensureKycSchema } from './services/identityReviewService.js'
import { ensureMainSchema } from './services/schemaService.js'
import { ensureRiskSchema } from './services/riskService.js'

export const app = express()

app.use(cors({ origin: env.corsOrigin, credentials: true }))
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
app.use('/api/payments', paymentRoutes)
app.use('/api/identity-review', identityReviewRoutes)
app.use('/api/kyc', identityReviewRoutes)
app.use('/api/risk', riskRoutes)

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const [grossRow] = await pool.query(
      `SELECT COALESCE(SUM(gross_sgd_amount), 0) AS total_gross,
              COALESCE(SUM(provider_fee_sgd + platform_fee_sgd), 0) AS total_fees,
              COALESCE(SUM(net_settlement_sgd_amount), 0) AS total_net
       FROM settlements
       WHERE merchant_id = ? AND status IN ('SETTLED', 'PAID_OUT')`,
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

await ensureMainSchema()
await ensureRiskSchema()
await ensureKycSchema()
startSettlementWorker()
