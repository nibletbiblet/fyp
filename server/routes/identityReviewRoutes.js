import { Router } from 'express'
import { authenticateAdminOrMerchant } from '../middleware/auth.js'
import {
  getPaymentKyc,
  listDeclinedReasons,
  listKycCases,
  reviewPoi,
  uploadPoi,
  upsertCustomerProfile,
  verifyMockSingpass,
} from '../services/identityReviewService.js'

const router = Router()

function handleKycError(err, res) {
  if (err.code === 'PAYMENT_NOT_FOUND') {
    return res.status(404).json({ error: err.message })
  }
  if (err.code === 'INVALID_KYC_INPUT') {
    return res.status(400).json({ error: err.message })
  }
  console.error('Identity review route error:', err)
  return res.status(500).json({ error: 'Internal server error during identity review processing' })
}

router.get('/cases', authenticateAdminOrMerchant, async (_req, res) => {
  try {
    res.json({ cases: await listKycCases() })
  } catch (err) {
    handleKycError(err, res)
  }
})

router.get('/declined-reasons', authenticateAdminOrMerchant, async (_req, res) => {
  try {
    res.json({ reasons: await listDeclinedReasons() })
  } catch (err) {
    handleKycError(err, res)
  }
})

router.get('/payments/:paymentId', async (req, res) => {
  try {
    res.json({ kyc: await getPaymentKyc(req.params.paymentId) })
  } catch (err) {
    handleKycError(err, res)
  }
})

router.post('/payments/:paymentId/profile', async (req, res) => {
  try {
    res.json({ kyc: await upsertCustomerProfile(req.params.paymentId, req.body) })
  } catch (err) {
    handleKycError(err, res)
  }
})

router.post('/payments/:paymentId/poi', async (req, res) => {
  try {
    res.json({ kyc: await uploadPoi(req.params.paymentId, req.body) })
  } catch (err) {
    handleKycError(err, res)
  }
})

router.post('/payments/:paymentId/singpass', async (req, res) => {
  try {
    res.json({ kyc: await verifyMockSingpass(req.params.paymentId) })
  } catch (err) {
    handleKycError(err, res)
  }
})

router.post('/payments/:paymentId/review', authenticateAdminOrMerchant, async (req, res) => {
  try {
    res.json({ kyc: await reviewPoi(req.params.paymentId, req.body) })
  } catch (err) {
    handleKycError(err, res)
  }
})

export default router
