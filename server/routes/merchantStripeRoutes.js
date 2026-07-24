import { Router } from 'express'
import { authenticateToken } from '../middleware/auth.js'
import {
  createStripeOnboardingLink,
  refreshStripeAccountStatus,
} from '../services/stripeConnectService.js'

const router = Router()

const handleStripeError = (res, err) => {
  if (err.code === 'STRIPE_SECRET_KEY_MISSING' || err.code === 'STRIPE_SANDBOX_KEY_REQUIRED') {
    return res.status(500).json({ error: err.message })
  }
  if (err.code === 'MERCHANT_NOT_FOUND') {
    return res.status(404).json({ error: err.message })
  }
  console.error('Stripe Connect route error:', err)
  return res.status(500).json({ error: 'Stripe Connect request failed' })
}

router.post('/onboarding-link', authenticateToken, async (req, res) => {
  try {
    const result = await createStripeOnboardingLink(req.merchantId)
    res.json(result)
  } catch (err) {
    handleStripeError(res, err)
  }
})

router.get('/status', authenticateToken, async (req, res) => {
  try {
    const status = await refreshStripeAccountStatus(req.merchantId)
    res.json(status)
  } catch (err) {
    handleStripeError(res, err)
  }
})

export default router
