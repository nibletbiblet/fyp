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
