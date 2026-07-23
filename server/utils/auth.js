import crypto from 'node:crypto'

const ITERATIONS = 100000
const KEY_LENGTH = 64
const DIGEST = 'sha512'

/**
 * Hashes a password using PBKDF2 with a random salt.
 * @param {string} password — The plaintext password.
 * @returns {{ hash: string, salt: string }}
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString('hex')
  const hash = crypto
    .pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString('hex')
  return { hash, salt }
}

/**
 * Verifies a password against a stored hash and salt.
 * Uses timing-safe comparison to prevent timing attacks.
 * @param {string} password — The plaintext password to verify.
 * @param {string} storedHash — The stored hex-encoded hash.
 * @param {string} storedSalt — The stored hex-encoded salt.
 * @returns {boolean}
 */
export function verifyPassword(password, storedHash, storedSalt) {
  const candidateHash = crypto
    .pbkdf2Sync(password, storedSalt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString('hex')
  // Timing-safe comparison
  const a = Buffer.from(candidateHash, 'hex')
  const b = Buffer.from(storedHash, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Retrieves a merchant_user record by email, joining with merchants.
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export async function getUserByEmail(pool, email) {
  const [rows] = await pool.query(
    `SELECT
       mu.id        AS user_id,
       mu.merchant_id,
       mu.email,
       mu.password_hash,
       mu.password_salt,
       mu.full_name,
       mu.role,
       m.name       AS merchant_name,
       m.status     AS merchant_status,
       m.bank_name,
       m.account_holder_name,
       m.account_last4,
       m.bank_account_label,
       m.kyc_status,
       m.triplea_merchant_id,
       m.triplea_wallet_id
     FROM merchant_users mu
     JOIN merchants m ON m.id = mu.merchant_id
     WHERE mu.email = ?`,
    [email]
  )
  return rows.length > 0 ? rows[0] : null
}
