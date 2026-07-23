import { Router } from 'express'
import { authenticateToken } from '../middleware/auth.js'
import {
  createPaymentRequest,
  detectPaymentTransaction,
  getCheckout,
  selectPaymentAsset,
  submitPaymentTransaction,
} from '../controllers/paymentController.js'

const router = Router()

router.post('/', authenticateToken, createPaymentRequest)
router.get('/:paymentId/checkout', getCheckout)
router.get('/:paymentId/detect', detectPaymentTransaction)
router.post('/:paymentId/select-asset', selectPaymentAsset)
router.post('/:paymentId/submit-tx', submitPaymentTransaction)

export default router
