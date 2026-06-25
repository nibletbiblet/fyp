import { Router } from 'express'
import { authenticateToken } from '../middleware/auth.js'
import {
  createPaymentRequest,
  getCheckout,
  selectPaymentAsset,
} from '../controllers/paymentController.js'

const router = Router()

router.post('/', authenticateToken, createPaymentRequest)
router.get('/:paymentId/checkout', getCheckout)
router.post('/:paymentId/select-asset', selectPaymentAsset)

export default router
