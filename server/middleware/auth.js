import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

/**
 * Creates a JWT for an authenticated merchant.
 * @param {string} merchantId
 * @returns {string} Signed JWT token
 */
export function createToken(merchantId) {
  return jwt.sign({ merchantId }, env.jwtSecret, { expiresIn: '24h' })
}

export function createAdminToken(adminUserId) {
  return jwt.sign({ adminUserId, tokenType: 'admin' }, env.jwtSecret, { expiresIn: '24h' })
}

/**
 * Express middleware — validates JWT from cookie or Authorization header.
 * On success, sets req.merchantId.
 */
export function authenticateToken(req, res, next) {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null)

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret)
    req.merchantId = payload.merchantId
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function authenticateAdminToken(req, res, next) {
  const token =
    req.cookies?.admin_token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null)

  if (!token) {
    return res.status(401).json({ error: 'Admin authentication required' })
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret)
    if (payload.tokenType !== 'admin' || !payload.adminUserId) {
      return res.status(401).json({ error: 'Invalid admin token' })
    }
    req.adminUserId = payload.adminUserId
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired admin token' })
  }
}

export function authenticateAdminOrMerchant(req, res, next) {
  const adminToken = req.cookies?.admin_token
  if (adminToken) {
    try {
      const payload = jwt.verify(adminToken, env.jwtSecret)
      if (payload.tokenType === 'admin' && payload.adminUserId) {
        req.adminUserId = payload.adminUserId
        return next()
      }
    } catch {
      return res.status(401).json({ error: 'Invalid or expired admin token' })
    }
  }

  return authenticateToken(req, res, next)
}
