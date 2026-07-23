import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

/**
 * Creates a JWT for an authenticated merchant user.
 * Includes userId and role for audit trail + role-based access.
 * @param {number} merchantId
 * @param {number} userId
 * @param {string} role - CEO | CFO | TECH_LEAD
 * @returns {string} Signed JWT token
 */
export function createToken(merchantId, userId, role) {
  return jwt.sign({ merchantId, userId, role }, env.jwtSecret, { expiresIn: '24h' })
}

/**
 * Express middleware — validates JWT from cookie or Authorization header.
 * On success, sets req.merchantId, req.userId, and req.userRole.
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
    req.userId = payload.userId
    req.userRole = payload.role
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
