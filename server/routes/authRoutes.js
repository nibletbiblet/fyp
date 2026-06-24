import { Router } from 'express'
import { env } from '../config/env.js'
import { createToken, authenticateToken } from '../middleware/auth.js'
import {
  createMerchant,
  verifyEmailAndProvision,
  authenticateMerchant,
  getMerchantProfile,
  resendVerification,
} from '../services/merchantService.js'

const router = Router()

const authCookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax',
  maxAge: 24 * 60 * 60 * 1000,
}

const clearAuthCookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax',
}

/**
 * POST /api/auth/register
 * Registers a new merchant account.
 */
router.post('/register', async (req, res) => {
  try {
    const { businessName, uen, email, password, bankName, bankHolderName, bankAccountNumber } = req.body

    // Basic validation
    if (!businessName || !email || !password || !bankName || !bankHolderName || !bankAccountNumber) {
      return res.status(400).json({ error: 'All required fields must be provided' })
    }

    // UEN format validation (Singapore: 8 digits + 1 letter)
    if (uen && !/^\d{8}[A-Z]$/.test(uen)) {
      return res.status(400).json({ error: 'Invalid UEN format. Expected 8 digits followed by a capital letter (e.g. 53912345M)' })
    }

    // Email format validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    // Password strength — minimum 8 chars
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    const { merchantId, verificationToken } = await createMerchant({
      businessName,
      uen,
      email,
      password,
      bankName,
      bankHolderName,
      bankAccountNumber,
    })

    // In production, send email with verification link.
    // For this prototype, return the token so the frontend can simulate it.
    res.status(201).json({
      message: 'Merchant registered successfully',
      merchantId,
      verificationToken,
      // Mock verification URL (the frontend will navigate to this)
      verificationUrl: `/verify-email?token=${verificationToken}`,
    })
  } catch (err) {
    if (err.code === 'DUPLICATE_EMAIL') {
      return res.status(409).json({ error: err.message })
    }
    if (err.code === 'DUPLICATE_UEN') {
      return res.status(409).json({ error: err.message })
    }
    console.error('Registration error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/auth/verify-email
 * Verifies the email token and provisions mock infrastructure.
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' })
    }

    const result = await verifyEmailAndProvision(token)

    if (result.alreadyVerified) {
      return res.json({ message: 'Email already verified', merchantId: result.merchantId })
    }

    res.json({
      message: 'Infrastructure provisioned successfully',
      merchantId: result.merchantId,
      containerId: result.containerId,
      walletId: result.walletId,
    })
  } catch (err) {
    if (err.code === 'INVALID_TOKEN') {
      return res.status(400).json({ error: err.message })
    }
    console.error('Verification error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/auth/login
 * Authenticates a merchant and sets the HTTP-only auth cookie.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const merchant = await authenticateMerchant(email, password)
    const token = createToken(merchant.merchantId)

    res.cookie('token', token, authCookieOptions)

    res.json({
      message: 'Login successful',
      merchant: {
        merchantId: merchant.merchantId,
        email: merchant.email,
        businessName: merchant.businessName,
        status: merchant.status,
      },
    })
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    console.error('Login error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/auth/me
 * Returns the authenticated merchant's profile.
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const profile = await getMerchantProfile(req.merchantId)
    res.json({ merchant: profile })
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Merchant not found' })
    }
    console.error('Profile error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/auth/resend-verification
 * Regenerates the verification token.
 */
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const { verificationToken } = await resendVerification(email)
    res.json({
      message: 'Verification link resent',
      verificationToken,
      verificationUrl: `/verify-email?token=${verificationToken}`,
    })
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: err.message })
    }
    console.error('Resend verification error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/auth/logout
 * Clears the auth cookie.
 */
router.post('/logout', (_req, res) => {
  res.clearCookie('token', clearAuthCookieOptions)
  res.json({ message: 'Logged out successfully' })
})

export default router
