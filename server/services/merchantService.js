import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import { v4 as uuidv4 } from 'uuid'
import pool from '../config/db.js'
import { encryptBankDetails } from '../utils/encryption.js'

const SALT_ROUNDS = 10
const DUMMY_PASSWORD_HASH = '$2b$10$C6UzMDM.H6dfI/f/IKcEeO15D/MH6fiHvo4G7Yx1uUymRETrx2rga'

/**
 * Registers a new merchant.
 * - Validates uniqueness of email and UEN.
 * - Hashes the password with bcrypt (10 salt rounds).
 * - Encrypts the bank account number with AES-256-GCM.
 * - Inserts the merchant with status ACTIVE_UNVERIFIED.
 * - Generates a mock email verification token.
 * - Creates an audit log entry.
 *
 * @returns {{ merchantId, verificationToken }}
 */
export async function createMerchant({
  businessName,
  uen,
  email,
  password,
  bankName,
  bankHolderName,
  bankAccountNumber,
}) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // 1. Check uniqueness
    const [existingEmail] = await conn.query(
      'SELECT merchant_id FROM merchants WHERE email = ?',
      [email]
    )
    if (existingEmail.length > 0) {
      throw Object.assign(new Error('Email already registered'), { code: 'DUPLICATE_EMAIL' })
    }

    if (uen) {
      const [existingUen] = await conn.query(
        'SELECT merchant_id FROM merchants WHERE uen = ?',
        [uen]
      )
      if (existingUen.length > 0) {
        throw Object.assign(new Error('UEN already registered'), { code: 'DUPLICATE_UEN' })
      }
    }

    // 2. Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    // 3. Encrypt bank account number
    const { encrypted, iv, authTag } = encryptBankDetails(bankAccountNumber)
    const bankAccountLast4 = bankAccountNumber.slice(-4)

    // 4. Generate verification token
    const verificationToken = crypto.randomBytes(48).toString('hex')

    // 5. Insert merchant
    const merchantId = uuidv4()
    await conn.query(
      `INSERT INTO merchants (
        merchant_id, business_name, uen, email, password_hash,
        bank_name, bank_holder_name, bank_account_last4,
        bank_account_encrypted, bank_account_iv, bank_account_auth_tag,
        email_verification_token, status, kyc_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE_UNVERIFIED', 'PENDING')`,
      [
        merchantId, businessName, uen || null, email, passwordHash,
        bankName, bankHolderName, bankAccountLast4,
        encrypted, iv, authTag,
        verificationToken,
      ]
    )

    // 6. Audit log
    await conn.query(
      `INSERT INTO audit_logs (merchant_id, actor_type, actor_id, action, details)
       VALUES (?, 'MERCHANT', ?, 'MERCHANT_REGISTERED', ?)`,
      [merchantId, merchantId, JSON.stringify({ email, businessName })]
    )

    await conn.commit()
    return { merchantId, verificationToken }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

/**
 * Verifies the email token and provisions mock infrastructure.
 * Runs as an atomic SQL transaction:
 * - Generates Container ID and Wallet ID.
 * - Sets status to ACTIVE_ONBOARDED.
 */
export async function verifyEmailAndProvision(token) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // Find merchant by verification token
    const [rows] = await conn.query(
      'SELECT merchant_id, status FROM merchants WHERE email_verification_token = ?',
      [token]
    )
    if (rows.length === 0) {
      throw Object.assign(new Error('Invalid verification token'), { code: 'INVALID_TOKEN' })
    }

    const merchant = rows[0]
    if (merchant.status === 'ACTIVE_ONBOARDED') {
      await conn.rollback()
      return { merchantId: merchant.merchant_id, alreadyVerified: true }
    }

    // Mint mock infrastructure IDs (simulating Triple-A provider)
    const containerId = `CTR-${crypto.randomBytes(8).toString('hex').toUpperCase()}`
    const walletId = `WLT-${crypto.randomBytes(8).toString('hex').toUpperCase()}`

    // Atomic update: provision infrastructure + set status
    await conn.query(
      `UPDATE merchants SET
        status = 'ACTIVE_ONBOARDED',
        email_verification_token = NULL,
        email_verified_at = NOW(),
        container_id = ?,
        wallet_id = ?,
        onboarded_at = NOW()
      WHERE merchant_id = ?`,
      [containerId, walletId, merchant.merchant_id]
    )

    // Audit log
    await conn.query(
      `INSERT INTO audit_logs (merchant_id, actor_type, actor_id, action, details)
       VALUES (?, 'SYSTEM', 'INFRASTRUCTURE_PROVISIONER', 'EMAIL_VERIFIED_INFRASTRUCTURE_PROVISIONED', ?)`,
      [merchant.merchant_id, JSON.stringify({ containerId, walletId })]
    )

    await conn.commit()
    return { merchantId: merchant.merchant_id, containerId, walletId, alreadyVerified: false }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

/**
 * Authenticates a merchant using timing-safe bcrypt comparison.
 * @returns {{ merchantId, email, businessName, status }}
 */
export async function authenticateMerchant(email, password) {
  const [rows] = await pool.query(
    'SELECT merchant_id, email, business_name, password_hash, status FROM merchants WHERE email = ?',
    [email]
  )
  if (rows.length === 0) {
    // Still run bcrypt compare to prevent timing attacks
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH)
    throw Object.assign(new Error('Invalid credentials'), { code: 'INVALID_CREDENTIALS' })
  }

  const merchant = rows[0]
  const valid = await bcrypt.compare(password, merchant.password_hash)
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { code: 'INVALID_CREDENTIALS' })
  }

  // Audit log — login
  await pool.query(
    `INSERT INTO audit_logs (merchant_id, actor_type, actor_id, action, details)
     VALUES (?, 'MERCHANT', ?, 'MERCHANT_LOGIN', ?)`,
    [merchant.merchant_id, merchant.merchant_id, JSON.stringify({ email })]
  )

  return {
    merchantId: merchant.merchant_id,
    email: merchant.email,
    businessName: merchant.business_name,
    status: merchant.status,
  }
}

/**
 * Retrieves merchant profile (masks sensitive fields).
 */
export async function getMerchantProfile(merchantId) {
  const [rows] = await pool.query(
    `SELECT merchant_id, business_name, uen, email,
            bank_name, bank_holder_name, bank_account_last4,
            kyc_status, status, container_id, wallet_id,
            email_verified_at, onboarded_at, created_at
     FROM merchants WHERE merchant_id = ?`,
    [merchantId]
  )
  if (rows.length === 0) {
    throw Object.assign(new Error('Merchant not found'), { code: 'NOT_FOUND' })
  }
  return rows[0]
}

/**
 * Resends verification — generates a new token.
 */
export async function resendVerification(email) {
  const newToken = crypto.randomBytes(48).toString('hex')
  const [result] = await pool.query(
    `UPDATE merchants SET email_verification_token = ?
     WHERE email = ? AND status = 'ACTIVE_UNVERIFIED'`,
    [newToken, email]
  )
  if (result.affectedRows === 0) {
    throw Object.assign(new Error('No unverified account found for this email'), { code: 'NOT_FOUND' })
  }
  return { verificationToken: newToken }
}
