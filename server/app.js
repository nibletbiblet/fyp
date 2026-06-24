import cors from 'cors'
import express from 'express'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import pool from './config/db.js'
import { authenticateToken } from './middleware/auth.js'
import authRoutes from './routes/authRoutes.js'
import { createPayment, selectCrypto, simulatePaymentBroadcast } from './services/paymentService.js'
import { startSettlementWorker } from './services/settlementWorker.js'

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

app.post('/api/payments', authenticateToken, async (req, res) => {
  try {
    const { amountSgd, description } = req.body

    if (!amountSgd || Number.isNaN(Number(amountSgd)) || Number(amountSgd) <= 0) {
      return res.status(400).json({ error: 'Valid amount in SGD is required' })
    }

    const { paymentId, paymentReference } = await createPayment(
      req.merchantId,
      Number(amountSgd),
      description
    )

    res.status(201).json({
      message: 'Payment created successfully',
      paymentId,
      paymentReference,
      checkoutUrl: `/checkout/${paymentId}`,
    })
  } catch (err) {
    console.error('Create payment error:', err)
    res.status(500).json({ error: 'Internal server error during payment creation' })
  }
})

app.get('/api/payments/:id', async (req, res) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query(
      `SELECT p.*, m.business_name AS merchant_name, m.email AS merchant_email
       FROM payments p
       JOIN merchants m ON m.merchant_id = p.merchant_id
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
         SUM(CASE WHEN status IN ('AWAITING_PAYMENT', 'PAYMENT_DETECTED', 'CONFIRMING') THEN 1 ELSE 0 END) AS pending_count
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

startSettlementWorker()
