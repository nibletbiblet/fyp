import { Router } from 'express'
import { env } from '../config/env.js'
import { createAdminToken, authenticateAdminToken } from '../middleware/auth.js'
import { authenticateAdmin, getAdminProfile } from '../services/adminService.js'

const router = Router()

const adminCookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax',
  maxAge: 24 * 60 * 60 * 1000,
}

const clearAdminCookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax',
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const admin = await authenticateAdmin(email, password)
    const token = createAdminToken(admin.adminUserId)
    res.cookie('admin_token', token, adminCookieOptions)

    res.json({
      message: 'Admin login successful',
      admin,
    })
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    console.error('Admin login error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/me', authenticateAdminToken, async (req, res) => {
  try {
    const admin = await getAdminProfile(req.adminUserId)
    res.json({ admin })
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Admin not found' })
    }
    console.error('Admin profile error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/logout', (_req, res) => {
  res.clearCookie('admin_token', clearAdminCookieOptions)
  res.json({ message: 'Admin logged out successfully' })
})

export default router
