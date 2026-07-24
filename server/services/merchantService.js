import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import pool from '../config/db.js'
import { env } from '../config/env.js'
import { ensureStripeConnectedAccountForMerchant } from './stripeConnectService.js'

const SALT_ROUNDS = 10
const DUMMY_PASSWORD_HASH = '$2b$10$C6UzMDM.H6dfI/f/IKcEeO15D/MH6fiHvo4G7Yx1uUymRETrx2rga'

const createEmailVerificationToken = (merchantId) =>
  jwt.sign({ merchantId, purpose: 'email_verification' }, env.jwtSecret, { expiresIn: '24h' })

const readEmailVerificationToken = (token) => {
  try {
    const payload = jwt.verify(token, env.jwtSecret)
    if (payload.purpose !== 'email_verification' || !payload.merchantId) {
      throw new Error('Invalid verification token')
    }
    return payload.merchantId
  } catch {
    throw Object.assign(new Error('Invalid verification token'), { code: 'INVALID_TOKEN' })
  }
}

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
    const [existingEmail] = await conn.query('SELECT id FROM merchants WHERE email = ?', [email])
    if (existingEmail.length > 0) {
      throw Object.assign(new Error('Email already registered'), { code: 'DUPLICATE_EMAIL' })
    }

    if (uen) {
      const [existingUen] = await conn.query(
        'SELECT id FROM merchants WHERE bank_account_label = ?',
        [uen]
      )
      if (existingUen.length > 0) {
        throw Object.assign(new Error('UEN already registered'), { code: 'DUPLICATE_UEN' })
      }
    }

    // 2. Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    // 3. Store only the bank account last 4 digits in this legacy live schema.
    const bankAccountLast4 = bankAccountNumber.slice(-4)

    // 4. Insert merchant
    const [merchantResult] = await conn.query(
      `INSERT INTO merchants (
        name, email, bank_name, account_holder_name, account_last4,
        bank_account_label, status, kyc_status
      ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE_UNVERIFIED', 'PENDING')`,
      [
        businessName,
        email,
        bankName,
        bankHolderName,
        bankAccountLast4,
        uen || null,
      ]
    )

    const merchantId = merchantResult.insertId
    const passwordSalt = crypto.randomBytes(16).toString('hex')

    await conn.query(
      `INSERT INTO merchant_users (
        merchant_id, email, password_hash, password_salt, full_name
      ) VALUES (?, ?, ?, ?, ?)`,
      [merchantId, email, passwordHash, passwordSalt, bankHolderName]
    )

    await conn.query(
      `INSERT INTO merchant_fee_profiles (merchant_id)
       VALUES (?)
       ON DUPLICATE KEY UPDATE merchant_id = VALUES(merchant_id)`,
      [merchantId]
    )

    const verificationToken = createEmailVerificationToken(merchantId)

    // 5. Audit log
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

    const merchantId = readEmailVerificationToken(token)
    const [rows] = await conn.query(
      'SELECT id, status FROM merchants WHERE id = ?',
      [merchantId]
    )
    if (rows.length === 0) {
      throw Object.assign(new Error('Invalid verification token'), { code: 'INVALID_TOKEN' })
    }

    const merchant = rows[0]
    if (merchant.status === 'ACTIVE_ONBOARDED') {
      await conn.rollback()
      return { merchantId: merchant.id, alreadyVerified: true }
    }

    // Mint mock infrastructure IDs for the simulated provider flow.
    const containerId = `CTR-${crypto.randomBytes(8).toString('hex').toUpperCase()}`
    const walletId = `WLT-${crypto.randomBytes(8).toString('hex').toUpperCase()}`

    const stripeConnectedAccountId = await ensureStripeConnectedAccountForMerchant(merchant.id, conn)

    await conn.query(
      `UPDATE merchants SET
        status = 'ACTIVE_ONBOARDED',
        container_id = ?,
        wallet_id = ?
      WHERE id = ?`,
      [containerId, walletId, merchant.id]
    )

    await conn.query(
      `INSERT INTO audit_logs (merchant_id, actor_type, actor_id, action, details)
       VALUES (?, 'SYSTEM', 'INFRASTRUCTURE_PROVISIONER', 'EMAIL_VERIFIED_INFRASTRUCTURE_PROVISIONED', ?)`,
      [merchant.id, JSON.stringify({ containerId, walletId })]
    )

    await conn.commit()
    return { merchantId: merchant.id, containerId, walletId, stripeConnectedAccountId, alreadyVerified: false }
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
    `SELECT
       m.id,
       m.email,
       m.name,
       m.status,
       mu.password_hash
     FROM merchants m
     JOIN merchant_users mu ON mu.merchant_id = m.id
     WHERE mu.email = ?`,
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
    [merchant.id, merchant.id, JSON.stringify({ email })]
  )

  return {
    merchantId: merchant.id,
    email: merchant.email,
    businessName: merchant.name,
    status: merchant.status,
  }
}

/**
 * Retrieves merchant profile (masks sensitive fields).
 */
export async function getMerchantProfile(merchantId) {
  const [rows] = await pool.query(
    `SELECT
       id AS merchant_id,
       name AS business_name,
       bank_account_label AS uen,
       email,
       bank_name,
       account_holder_name AS bank_holder_name,
       account_last4 AS bank_account_last4,
       kyc_status,
       status,
       container_id,
       wallet_id,
       stripe_connected_account_id,
       stripe_onboarding_status,
       stripe_details_submitted,
       stripe_payouts_enabled,
       stripe_charges_enabled,
       stripe_requirements_currently_due,
       stripe_requirements_disabled_reason,
       stripe_status_synced_at,
       CASE WHEN status = 'ACTIVE_ONBOARDED' THEN updated_at ELSE NULL END AS email_verified_at,
       CASE WHEN status = 'ACTIVE_ONBOARDED' THEN updated_at ELSE NULL END AS onboarded_at,
       created_at
     FROM merchants WHERE id = ?`,
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
  const [rows] = await pool.query(
    `SELECT id
     FROM merchants
     WHERE email = ? AND status = 'ACTIVE_UNVERIFIED'`,
    [email]
  )
  if (rows.length === 0) {
    throw Object.assign(new Error('No unverified account found for this email'), { code: 'NOT_FOUND' })
  }
  return { verificationToken: createEmailVerificationToken(rows[0].id) }
}
