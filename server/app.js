import cors from 'cors'
import express from 'express'
import { env } from './config/env.js'

export const app = express()

app.use(cors({ origin: env.corsOrigin }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'crypto-payment-platform-backend',
    environment: env.nodeEnv,
  })
})
