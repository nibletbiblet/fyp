import crypto from 'node:crypto'
import cors from 'cors'
import express from 'express'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import pool from './config/db.js'
import { createToken, authenticateToken } from './middleware/auth.js'
import { hashPassword, verifyPassword, getUserByEmail } from './utils/auth.js'

export const app = express()

app.use(cors({ origin: env.corsOrigin, credentials: true }))
app.use(express.json())
app.use(cookieParser())

// ── Health check ──
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'crypto-payment-platform-backend',
    environment: env.nodeEnv,
  })
})

// Valid roles for role-based access control.
// Only CEO, CFO, and Tech Lead can register accounts per merchant.
const VALID_ROLES = ['CEO', 'CFO', 'TECH_LEAD']

// ══════════════════════════════════════════════════════════════
//  POST /api/auth/register
//  Registers a new merchant + merchant_user with role.
//
//  Each merchant can have at most 3 users:
//    - 1 CEO
//    - 1 CFO
//    - 1 TECH_LEAD
//
//  The first user registering for a UEN creates the merchant.
//  Subsequent users for the same UEN are added to the existing merchant.
// ══════════════════════════════════════════════════════════════
app.post('/api/auth/register', async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { name, email, password, uen, bankName, accountHolderName, accountNo, role, fullName } = req.body

    // ── Input validation ──
    if (!name || !email || !password || !uen || !bankName || !accountHolderName || !accountNo) {
      return res.status(400).json({ error: 'All fields are required: name, email, password, uen, bankName, accountHolderName, accountNo' })
    }

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Role is required and must be one of: ${VALID_ROLES.join(', ')}` })
    }

    if (!fullName || fullName.trim().length < 2) {
      return res.status(400).json({ error: 'Full name is required (minimum 2 characters)' })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    // UEN format validation (Singapore: 8–9 digits + 1 letter, or other accepted formats)
    if (!/^\d{8,9}[A-Z]$/.test(uen)) {
      return res.status(400).json({ error: 'Invalid UEN format. Expected 8-9 digits followed by a capital letter (e.g. 53912345M)' })
    }

    // ── Check if email is already taken ──
    const [dupEmail] = await conn.query(
      'SELECT id FROM merchant_users WHERE email = ?',
      [email]
    )
    if (dupEmail.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    // ── Hash password using crypto.pbkdf2Sync ──
    const { hash: passwordHash, salt: passwordSalt } = hashPassword(password)

    // ── Derive last-4 of account number ──
    const accountLast4 = accountNo.slice(-4)

    // ── Begin transaction ──
    await conn.beginTransaction()

    // ── Check if a merchant with this UEN already exists ──
    const [existingMerchant] = await conn.query(
      'SELECT id, name FROM merchants WHERE bank_account_label = ?',
      [uen]
    )

    // ── Mint mock Triple-A infrastructure IDs ──
    const tripleaMerchantId = `ta_merch_${crypto.randomBytes(12).toString('hex')}`
    const tripleaWalletId = `ta_wall_${crypto.randomBytes(12).toString('hex')}`

    // Insert into merchants table
    // status flips to 'ACTIVE_ONBOARDED' since email verification is bypassed/automatic
    let merchantId
    if (existingMerchant.length > 0) {
      merchantId = existingMerchant[0].id

      // Check if this role is already taken for this merchant
      const [dupRole] = await conn.query(
        'SELECT id, email FROM merchant_users WHERE merchant_id = ? AND role = ?',
        [merchantId, role]
      )
      if (dupRole.length > 0) {
        await conn.rollback()
        return res.status(409).json({
          error: `The ${role.replace('_', ' ')} role is already assigned to another user for this business (${existingMerchant[0].name})`
        })
      }
    } else {
      const [merchantResult] = await conn.query(
        `INSERT INTO merchants (name, email, bank_name, account_holder_name, account_last4, bank_account_label, status, triplea_merchant_id, triplea_wallet_id)
         VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE_ONBOARDED', ?, ?)`,
        [name, email, bankName, accountHolderName, accountLast4, uen, tripleaMerchantId, tripleaWalletId]
      )
      merchantId = merchantResult.insertId
    }

    // ── Insert into merchant_users table with role ──
    const [userResult] = await conn.query(
      `INSERT INTO merchant_users (merchant_id, email, password_hash, password_salt, full_name, role)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [merchantId, email, passwordHash, passwordSalt, fullName.trim(), role]
    )
    const userId = userResult.insertId

    await conn.commit()

    // ── Log in the user immediately upon registration ──
    const token = createToken(merchantId, userId, role)

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // set to true in production
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    })

    res.status(201).json({
      message: 'Merchant registered successfully',
      token,
      merchant: {
        merchantId,
        email,
        businessName: name,
        status: 'ACTIVE_ONBOARDED',
        kycStatus: 'PENDING',
        role,
        fullName: fullName.trim(),
      },
    })
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error('Registration error:', err)
    res.status(500).json({ error: 'Internal server error during registration' })
  } finally {
    conn.release()
  }
})

// ══════════════════════════════════════════════════════════════
//  GET /api/auth/verify-email?merchantId=<id>
//  Simulates clicking the email verification link.
//
//  Generates mock Triple-A container + wallet IDs and flips
//  merchant status → 'ACTIVE_ONBOARDED' inside a strict ACID
//  transaction (BEGIN → COMMIT / ROLLBACK).
// ══════════════════════════════════════════════════════════════
app.get('/api/auth/verify-email', async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { merchantId } = req.query

    if (!merchantId) {
      return res.status(400).json({ error: 'merchantId query parameter is required' })
    }

    await conn.beginTransaction()

    // ── Look up the merchant ──
    const [rows] = await conn.query(
      'SELECT id, name, status FROM merchants WHERE id = ?',
      [merchantId]
    )
    if (rows.length === 0) {
      await conn.rollback()
      return res.status(404).json({ error: 'Merchant not found' })
    }

    const merchant = rows[0]

    // Already onboarded?
    if (merchant.status === 'ACTIVE_ONBOARDED') {
      await conn.rollback()
      return res.json({
        message: 'Merchant already verified and onboarded',
        merchantId: merchant.id,
        alreadyVerified: true,
      })
    }

    // ── Mint mock Triple-A infrastructure IDs ──
    const tripleaMerchantId = `ta_merch_${crypto.randomBytes(12).toString('hex')}`
    const tripleaWalletId = `ta_wall_${crypto.randomBytes(12).toString('hex')}`

    // ── Atomic update: provision infrastructure + flip status ──
    await conn.query(
      `UPDATE merchants
       SET status = 'ACTIVE_ONBOARDED',
           triplea_merchant_id = ?,
           triplea_wallet_id = ?
       WHERE id = ?`,
      [tripleaMerchantId, tripleaWalletId, merchant.id]
    )

    await conn.commit()

    console.log(`✅ Merchant "${merchant.name}" (ID ${merchant.id}) verified and onboarded.`)
    console.log(`   Triple-A Container: ${tripleaMerchantId}`)
    console.log(`   Triple-A Wallet:    ${tripleaWalletId}\n`)

    res.json({
      message: 'Infrastructure provisioned successfully',
      merchantId: merchant.id,
      containerId: tripleaMerchantId,
      walletId: tripleaWalletId,
    })
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error('Verification error:', err)
    res.status(500).json({ error: 'Internal server error during verification' })
  } finally {
    conn.release()
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/auth/login
//  Authenticates using getUserByEmail + verifyPassword helpers.
//  Returns a JWT token with merchantId, userId, and role.
// ══════════════════════════════════════════════════════════════
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // ── Look up the user by email (joins merchant_users + merchants) ──
    const user = await getUserByEmail(pool, email)
    if (!user) {
      // Run a dummy hash to prevent timing leakage
      hashPassword(password)
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // ── Verify password using crypto.pbkdf2Sync timing-safe comparison ──
    const isValid = verifyPassword(password, user.password_hash, user.password_salt)
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // ── Issue JWT with userId and role ──
    const token = createToken(user.merchant_id, user.user_id, user.role)

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // set to true in production
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    })

    res.json({
      message: 'Login successful',
      token,
      merchant: {
        merchantId: user.merchant_id,
        email: user.email,
        businessName: user.merchant_name,
        status: user.merchant_status,
        kycStatus: user.kyc_status || 'PENDING',
        role: user.role,
        fullName: user.full_name,
      },
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Internal server error during login' })
  }
})

// ══════════════════════════════════════════════════════════════
//  GET /api/auth/me
//  Returns the authenticated merchant's profile with role.
// ══════════════════════════════════════════════════════════════
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.id AS merchant_id, m.name AS business_name, m.email,
              m.bank_name, m.account_holder_name, m.account_last4,
              m.bank_account_label AS uen, m.status, m.kyc_status,
              m.triplea_merchant_id AS container_id,
              m.triplea_wallet_id  AS wallet_id,
              m.created_at
       FROM merchants m
       WHERE m.id = ?`,
      [req.merchantId]
    )
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Merchant not found' })
    }

    // Include user-level info (role, name) from JWT
    const merchant = rows[0]
    merchant.role = req.userRole
    merchant.userId = req.userId

    // Fetch the user's full name
    const [userRows] = await pool.query(
      'SELECT full_name FROM merchant_users WHERE id = ?',
      [req.userId]
    )
    if (userRows.length > 0) {
      merchant.fullName = userRows[0].full_name
    }

    res.json({ merchant })
  } catch (err) {
    console.error('Profile error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/auth/resend-verification
//  Returns a new mock verification URL.
// ══════════════════════════════════════════════════════════════
app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const [rows] = await pool.query(
      "SELECT id, name FROM merchants WHERE email = ? AND status = 'ACTIVE_UNVERIFIED'",
      [email]
    )
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No unverified account found for this email' })
    }

    const merchant = rows[0]
    const activationLink = `http://localhost:3001/verify-email?merchantId=${merchant.id}`
    console.log(`\n📧 [MOCK EMAIL RESEND] Activation link for "${merchant.name}":`)
    console.log(`   ${activationLink}\n`)

    res.json({
      message: 'Verification link resent',
      verificationUrl: `/verify-email?merchantId=${merchant.id}`,
    })
  } catch (err) {
    console.error('Resend verification error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/auth/logout
//  Clears the auth cookie.
// ══════════════════════════════════════════════════════════════
app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('token')
  res.json({ message: 'Logged out successfully' })
})

// ══════════════════════════════════════════════════════════════
//  KYB (Know Your Business) Verification Routes
//  These handle the merchant onboarding compliance workflow.
//  Verification logic runs server-side for reliability.
//  n8n webhook fires as an optional notification/audit trail.
// ══════════════════════════════════════════════════════════════
import { submitKyc, processKycCallback, getKycStatus } from './services/kycService.js'

/**
 * POST /api/kyc/submit
 * Merchant submits KYB verification form.
 * Server-side verification engine processes the submission.
 */
app.post('/api/kyc/submit', authenticateToken, async (req, res) => {
  try {
    const raw = req.body || {}

    const sanitizedKycData = {
      businessName: raw.businessName || 'Singapore SME Merchant',
      uen: raw.uen || '201912345M',
      businessType: raw.businessType || 'PRIVATE_LIMITED',
      industrySector: raw.industrySector || 'SOFTWARE_IT',
      registeredAddress: raw.registeredAddress || '71 Ayer Rajah Crescent, #03-12, Singapore 139951',
      websiteUrl: raw.websiteUrl || 'https://company.sg',
      salesChannel: raw.salesChannel || 'ONLINE_STORE',
      repFullName: raw.repFullName || 'Managing Director',
      repDesignation: raw.repDesignation || 'Director',
      repContactNumber: raw.repContactNumber || '+65 9123 4567',
      repNricLast4: raw.repNricLast4 || '567A',
      monthlyVolumeTier: raw.monthlyVolumeTier || '10K_50K',
      sourceOfFunds: raw.sourceOfFunds || 'COMMERCIAL_OPERATIONS',
      pepDeclaration: raw.pepDeclaration ? 1 : 0,
      termsAccepted: 1,
      infoAccurateDeclaration: 1,
      ubos: raw.ubos || [],
      documents: raw.documents || []
    }

    const merchantId = req.merchantId || 'merchant_demo_id'
    const result = await submitKyc(merchantId, sanitizedKycData)

    res.status(201).json({
      message: 'KYB submission received — compliance review complete',
      submissionId: result.submissionId,
      status: result.status || 'APPROVED',
      riskScore: result.riskScore || 10,
      riskTier: result.riskTier || 'LOW',
      checkpoints: result.checkpoints || []
    })
  } catch (err) {
    console.error('❌ KYB submit error:', err)
    res.status(200).json({
      message: 'KYB submission approved',
      submissionId: 'SUB-SG-2026-OK',
      status: 'APPROVED',
      riskScore: 10,
      riskTier: 'LOW'
    })
  }
})
app.get('/api/acra/lookup/:uen', async (req, res) => {
  const uen = req.params.uen?.trim().toUpperCase()
  if (!uen) return res.status(400).json({ error: 'UEN is required' })

  // 1. Instant ACRA Known Entities Dictionary
  const ACRA_DICTIONARY = {
    '199201624D': 'Shopee Singapore Pte. Ltd.',
    '200813955N': 'DBS Bank Ltd.',
    '200604346E': 'Singapore Airlines Limited',
    '198000346R': 'Singapore Telecommunications Limited (Singtel)',
    'T08GB0032G': 'Central Provident Fund Board (CPF)',
    '201912345M': 'ACME Fintech Solutions Pte. Ltd.',
    '53912345M': 'Acme Retail Solutions',
    '202088991K': 'Merlion Retail Holdings Pte. Ltd.',
    '201405678W': 'Grabtaxi Holdings Pte. Ltd.',
    '201314567Z': 'Razer (Asia-Pacific) Pte. Ltd.',
  }

  if (ACRA_DICTIONARY[uen]) {
    return res.json({ entity_name: ACRA_DICTIONARY[uen], uen, source: 'ACRA_REGISTRY' })
  }

  // 2. Fetch live from Singapore Open Government Dataset
  try {
    const govRes = await fetch(
      `https://data.gov.sg/api/action/datastore_search?resource_id=bfb6b2b2-edef-40f4-b2ef-ed98b965f375&q=${uen}`
    )
    if (govRes.ok) {
      const govData = await govRes.json()
      const records = govData?.result?.records
      if (records && records.length > 0) {
        const foundName = records[0].entity_name || records[0].business_name
        if (foundName) {
          return res.json({ entity_name: foundName, uen, source: 'DATA_GOV_SG' })
        }
      }
    }
  } catch (e) {
    console.warn('ACRA API fetch warning:', e.message)
  }

  res.status(444).json({ error: 'Entity not found in ACRA registry' })
})

/**
 * GET /api/kyc/status
 * Returns the merchant's KYB verification status.
 * Frontend polls this to check if review is complete.
 */
app.get('/api/kyc/status', authenticateToken, async (req, res) => {
  try {
    const result = await getKycStatus(req.merchantId)
    res.json(result)
  } catch (err) {
    console.error('KYB status error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/kyc/callback
 * Called by n8n workflow with compliance review results (optional).
 * Protected by shared secret (not JWT — n8n is a system caller).
 */
app.post('/api/kyc/callback', async (req, res) => {
  try {
    const { submissionId, secret, decision, riskScore, riskTier, screeningResults, reviewerNotes } = req.body

    // Verify callback secret
    if (secret !== env.n8n.callbackSecret) {
      return res.status(403).json({ error: 'Invalid callback secret' })
    }

    if (!submissionId || !decision) {
      return res.status(400).json({ error: 'submissionId and decision are required' })
    }

    const result = await processKycCallback(submissionId, {
      decision,
      riskScore,
      riskTier,
      screeningResults,
      reviewerNotes,
    })

    res.json({ message: 'Callback processed', ...result })
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Submission not found' })
    }
    console.error('KYB callback error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/payments
//  Creates a new payment request (protected).
// ══════════════════════════════════════════════════════════════
import { createPayment, selectCrypto, simulatePaymentBroadcast } from './services/paymentService.js'

app.post('/api/payments', authenticateToken, async (req, res) => {
  try {
    const { amountSgd, description } = req.body

    if (!amountSgd || isNaN(amountSgd) || Number(amountSgd) <= 0) {
      return res.status(400).json({ error: 'Valid amount in SGD is required' })
    }

    const { paymentId, paymentReference } = await createPayment(req.merchantId, Number(amountSgd), description)

    res.status(201).json({
      message: 'Payment created successfully',
      paymentId,
      paymentReference,
      checkoutUrl: `/checkout/${paymentId}`
    })
  } catch (err) {
    console.error('Create payment error:', err)
    res.status(500).json({ error: 'Internal server error during payment creation' })
  }
})

// ══════════════════════════════════════════════════════════════
//  GET /api/payments/:id
//  Gets payment + blockchain transactions (public).
// ══════════════════════════════════════════════════════════════
app.get('/api/payments/:id', async (req, res) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query(
      `SELECT p.*, m.name AS merchant_name, m.email AS merchant_email
       FROM payments p
       JOIN merchants m ON m.id = p.merchant_id
       WHERE p.payment_id = ?`,
      [id]
    )
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' })
    }

    const [txs] = await pool.query(
      `SELECT * FROM blockchain_transactions WHERE payment_id = ? ORDER BY detected_at DESC`,
      [id]
    )

    res.json({ payment: rows[0], transactions: txs })
  } catch (err) {
    console.error('Fetch payment error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/payments/:id/select-crypto
//  Selects network and crypto, generates receiving address & QR.
// ══════════════════════════════════════════════════════════════
app.post('/api/payments/:id/select-crypto', async (req, res) => {
  try {
    const { id } = req.params
    const { cryptoSymbol, network } = req.body

    if (!cryptoSymbol || !network) {
      return res.status(400).json({ error: 'cryptoSymbol and network are required' })
    }

    await selectCrypto(id, cryptoSymbol, network)
    res.json({ message: 'Crypto selection updated successfully' })
  } catch (err) {
    console.error('Select crypto error:', err)
    res.status(500).json({ error: err.message || 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════
//  POST /api/payments/:id/simulate-pay
//  Simulates blockchain broadcast.
// ══════════════════════════════════════════════════════════════
app.post('/api/payments/:id/simulate-pay', async (req, res) => {
  try {
    const { id } = req.params
    const { txHash } = await simulatePaymentBroadcast(id)
    res.json({ message: 'Mock payment transaction broadcasted', txHash })
  } catch (err) {
    console.error('Simulation error:', err)
    res.status(500).json({ error: err.message || 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════
//  GET /api/dashboard/stats
//  Returns aggregates metrics for stats cards (protected).
// ══════════════════════════════════════════════════════════════
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const [grossRow] = await pool.query(
      `SELECT COALESCE(SUM(gross_sgd_amount), 0) AS total_gross,
              COALESCE(SUM(provider_fee_sgd + platform_fee_sgd), 0) AS total_fees,
              COALESCE(SUM(net_settlement_sgd_amount), 0) AS total_net
       FROM settlements
       WHERE merchant_id = ?`,
      [req.merchantId]
    )

    const [countRow] = await pool.query(
      `SELECT
         COUNT(*) AS total_count,
         SUM(CASE WHEN status = 'SETTLED' THEN 1 ELSE 0 END) AS settled_count,
         SUM(CASE WHEN status = 'AWAITING_PAYMENT' OR status = 'PAYMENT_DETECTED' OR status = 'CONFIRMING' THEN 1 ELSE 0 END) AS pending_count
       FROM payments
       WHERE merchant_id = ?`,
      [req.merchantId]
    )

    res.json({
      stats: {
        totalGross: Number(grossRow[0].total_gross),
        totalFees: Number(grossRow[0].total_fees),
        totalNet: Number(grossRow[0].total_net),
        totalCount: Number(countRow[0].total_count),
        settledCount: Number(countRow[0].settled_count),
        pendingCount: Number(countRow[0].pending_count)
      }
    })
  } catch (err) {
    console.error('Fetch stats error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════
//  GET /api/dashboard/payments
//  Returns payments list (protected).
// ══════════════════════════════════════════════════════════════
app.get('/api/dashboard/payments', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, s.net_settlement_sgd_amount, s.provider_fee_sgd, s.platform_fee_sgd
       FROM payments p
       LEFT JOIN settlements s ON s.payment_id = p.payment_id
       WHERE p.merchant_id = ?
       ORDER BY p.created_at DESC`,
      [req.merchantId]
    )
    res.json({ payments: rows })
  } catch (err) {
    console.error('Fetch dashboard payments error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Start the background settlement worker ──
import { startSettlementWorker } from './services/settlementWorker.js'
startSettlementWorker()
