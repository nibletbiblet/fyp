import crypto from 'node:crypto'
import pool from '../config/db.js'

const normalizeWallet = (walletAddress) => String(walletAddress || '').trim().toLowerCase()

const toJson = (value) => JSON.stringify(value)

export async function ensureRiskSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_profiles (
      wallet_address VARCHAR(128) NOT NULL,
      successful_payments INT UNSIGNED NOT NULL DEFAULT 0,
      failed_payments INT UNSIGNED NOT NULL DEFAULT 0,
      watchlist_status VARCHAR(20) NOT NULL DEFAULT 'NONE',
      notes TEXT DEFAULT NULL,
      first_seen_at TIMESTAMP NULL DEFAULT NULL,
      last_seen_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (wallet_address),
      KEY idx_wallet_profiles_watchlist_status (watchlist_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS risk_assessments (
      risk_assessment_id VARCHAR(36) NOT NULL,
      payment_id VARCHAR(36) NOT NULL,
      stage VARCHAR(24) NOT NULL,
      wallet_address VARCHAR(128) DEFAULT NULL,
      score INT UNSIGNED NOT NULL,
      risk_level VARCHAR(20) NOT NULL,
      decision VARCHAR(32) NOT NULL,
      reasons JSON DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (risk_assessment_id),
      KEY idx_risk_assessments_payment_created (payment_id, created_at),
      KEY idx_risk_assessments_decision (decision),
      KEY idx_risk_assessments_wallet (wallet_address),
      CONSTRAINT fk_risk_assessments_payments
        FOREIGN KEY (payment_id) REFERENCES payments (payment_id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

function classify(rules) {
  if (rules.some((rule) => rule.severity === 'REJECT')) {
    return { severityScore: 100, riskLevel: 'CRITICAL', decision: 'REJECT' }
  }

  if (rules.some((rule) => rule.severity === 'HIGH')) {
    return { severityScore: 75, riskLevel: 'HIGH', decision: 'MANUAL_REVIEW' }
  }

  const mediumRuleCount = rules.filter((rule) => rule.severity === 'MEDIUM').length
  const lowRuleCount = rules.filter((rule) => rule.severity === 'LOW').length

  if (mediumRuleCount >= 2 || (mediumRuleCount >= 1 && lowRuleCount >= 1)) {
    return { severityScore: 50, riskLevel: 'MEDIUM', decision: 'KYC_REQUIRED' }
  }

  if (mediumRuleCount === 1 || lowRuleCount >= 3) {
    return { severityScore: 25, riskLevel: 'LOW', decision: 'ALLOW' }
  }

  return { severityScore: 0, riskLevel: 'LOW', decision: 'ALLOW' }
}

async function getPayment(paymentId) {
  const [payments] = await pool.query(
    `SELECT payment_id, merchant_id, customer_reference, amount_sgd, status
     FROM payments
     WHERE payment_id = ?`,
    [paymentId]
  )
  if (payments.length === 0) {
    throw Object.assign(new Error('Payment not found'), { code: 'PAYMENT_NOT_FOUND' })
  }
  return payments[0]
}

async function hasVerifiedKyc(paymentId) {
  const [rows] = await pool.query(
    `SELECT kyc_status
     FROM payment_kyc_cases
     WHERE payment_id = ?
     LIMIT 1`,
    [paymentId]
  )
  return rows[0]?.kyc_status === 'VERIFIED'
}

async function getCustomerHistory(payment) {
  if (!payment.customer_reference) {
    return { previousPayments: 0, recentPayments: 0, missingReference: true }
  }

  const [history] = await pool.query(
    `SELECT
       SUM(CASE WHEN payment_id <> ? THEN 1 ELSE 0 END) AS previous_payments,
       SUM(CASE WHEN payment_id <> ? AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR) THEN 1 ELSE 0 END) AS recent_payments
     FROM payments
     WHERE merchant_id = ? AND customer_reference = ?`,
    [payment.payment_id, payment.payment_id, payment.merchant_id, payment.customer_reference]
  )

  return {
    previousPayments: Number(history[0]?.previous_payments || 0),
    recentPayments: Number(history[0]?.recent_payments || 0),
    missingReference: false,
  }
}

async function getWalletProfile(walletAddress) {
  const normalizedWallet = normalizeWallet(walletAddress)
  if (!normalizedWallet) return null

  const [profiles] = await pool.query(
    `SELECT *
     FROM wallet_profiles
     WHERE wallet_address = ?`,
    [normalizedWallet]
  )
  return profiles[0] || {
    wallet_address: normalizedWallet,
    successful_payments: 0,
    failed_payments: 0,
    watchlist_status: 'NONE',
  }
}

export async function getLatestRiskAssessment(paymentId) {
  const [rows] = await pool.query(
    `SELECT *
     FROM risk_assessments
     WHERE payment_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [paymentId]
  )
  if (rows.length === 0) return null
  return mapRiskAssessment(rows[0])
}

export async function assessPaymentRisk(paymentId, { stage = 'PRE_PAYMENT', walletAddress = null } = {}) {
  const payment = await getPayment(paymentId)
  const normalizedWallet = normalizeWallet(walletAddress)
  const customerHistory = await getCustomerHistory(payment)
  const walletProfile = await getWalletProfile(normalizedWallet)
  const verifiedKyc = await hasVerifiedKyc(paymentId)
  const rules = []

  if (Number(payment.amount_sgd) > 999) {
    rules.push({ code: 'AMOUNT_OVER_999', severity: 'MEDIUM', message: 'Payment amount is above S$999' })
  }

  if (customerHistory.missingReference) {
    rules.push({ code: 'NO_CUSTOMER_REFERENCE', severity: 'LOW', message: 'No customer reference was supplied' })
  } else if (customerHistory.previousPayments === 0) {
    rules.push({ code: 'FIRST_TIME_CUSTOMER', severity: 'LOW', message: 'First payment from this customer reference' })
  }

  if (customerHistory.recentPayments >= 3) {
    rules.push({ code: 'CUSTOMER_VELOCITY', severity: 'HIGH', message: 'Customer has 3 or more payments within 1 hour' })
  }

  if (normalizedWallet) {
    if (!walletProfile || Number(walletProfile.successful_payments || 0) + Number(walletProfile.failed_payments || 0) === 0) {
      rules.push({ code: 'FIRST_TIME_WALLET', severity: 'LOW', message: 'First payment from this wallet' })
    }

    if (walletProfile?.watchlist_status === 'WATCHLIST') {
      rules.push({ code: 'WATCHLIST_WALLET', severity: 'HIGH', message: 'Wallet is on the internal watchlist' })
    }

    if (walletProfile?.watchlist_status === 'BLOCKED') {
      rules.push({ code: 'BLOCKED_WALLET', severity: 'REJECT', message: 'Wallet is blocked by the platform' })
    }
  }

  if (verifiedKyc) {
    rules.push({ code: 'VERIFIED_KYC', severity: 'MITIGATING', message: 'Customer KYC is verified' })
  }

  const activeRules = verifiedKyc
    ? rules.filter((rule) => rule.severity !== 'LOW' && rule.code !== 'AMOUNT_OVER_999')
    : rules
  const classification = classify(activeRules)
  const assessment = {
    riskAssessmentId: crypto.randomUUID(),
    paymentId,
    stage,
    walletAddress: normalizedWallet || null,
    severityScore: classification.severityScore,
    riskLevel: classification.riskLevel,
    decision: classification.decision,
    rules,
  }

  await pool.query(
    `INSERT INTO risk_assessments (
       risk_assessment_id, payment_id, stage, wallet_address, score, risk_level, decision, reasons
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      assessment.riskAssessmentId,
      paymentId,
      stage,
      assessment.walletAddress,
      assessment.severityScore,
      assessment.riskLevel,
      assessment.decision,
      toJson(rules),
    ]
  )

  return assessment
}

export async function updateWalletProfileAfterPayment({ walletAddress, succeeded }) {
  const normalizedWallet = normalizeWallet(walletAddress)
  if (!normalizedWallet) return

  await pool.query(
    `INSERT INTO wallet_profiles (
       wallet_address, successful_payments, failed_payments, first_seen_at, last_seen_at
     ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       successful_payments = successful_payments + VALUES(successful_payments),
       failed_payments = failed_payments + VALUES(failed_payments),
       last_seen_at = CURRENT_TIMESTAMP`,
    [normalizedWallet, succeeded ? 1 : 0, succeeded ? 0 : 1]
  )
}

export async function listRiskAssessments(merchantId = null) {
  const params = []
  const merchantFilter = merchantId ? 'WHERE p.merchant_id = ?' : ''
  if (merchantId) params.push(merchantId)

  const [rows] = await pool.query(
    `SELECT r.*, p.payment_reference, p.amount_sgd, p.status AS payment_status
     FROM risk_assessments r
     JOIN payments p ON p.payment_id = r.payment_id
     ${merchantFilter}
     ORDER BY r.created_at DESC`
    ,
    params
  )
  return rows.map(mapRiskAssessment)
}

function mapRiskAssessment(row) {
  let reasons = []
  if (row.reasons) {
    if (Array.isArray(row.reasons)) {
      reasons = row.reasons
    } else {
      try {
        reasons = JSON.parse(row.reasons)
      } catch {
        reasons = []
      }
    }
  }

  return {
    riskAssessmentId: row.risk_assessment_id,
    paymentId: row.payment_id,
    paymentReference: row.payment_reference,
    amountSgd: row.amount_sgd !== undefined ? Number(row.amount_sgd) : undefined,
    paymentStatus: row.payment_status,
    stage: row.stage,
    walletAddress: row.wallet_address,
    severityScore: Number(row.score),
    riskLevel: row.risk_level,
    decision: row.decision,
    rules: reasons.map((reason) => ({
      code: reason.code,
      severity: reason.severity || (Number(reason.points || 0) >= 50 ? 'HIGH' : Number(reason.points || 0) >= 20 ? 'MEDIUM' : Number(reason.points || 0) < 0 ? 'MITIGATING' : 'LOW'),
      message: reason.message,
    })),
    reasons,
    createdAt: row.created_at,
  }
}
