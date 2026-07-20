import { Router } from 'express'
import { authenticateToken } from '../middleware/auth.js'
import { listRiskAssessments } from '../services/riskService.js'

const router = Router()

router.get('/assessments', authenticateToken, async (req, res) => {
  try {
    const assessments = await listRiskAssessments(req.merchantId)
    res.json({ assessments })
  } catch (err) {
    console.error('List risk assessments error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
