import crypto from 'node:crypto'
import pool from '../config/db.js'
import { getLatestRiskAssessment } from './riskService.js'

const MAX_POI_SIZE_BYTES = 3 * 1024 * 1024
const ACCEPTED_POI_TYPES = new Set(['image/jpeg', 'image/jpg'])

const toBool = (value) => Boolean(Number(value))

function kycRequiredByRisk(risk) {
  return risk?.decision === 'KYC_REQUIRED'
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''))
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

function mapCase(row, required = true) {
  if (!row?.case_id) return null
  return {
    caseId: row.case_id,
    paymentId: row.payment_id,
    paymentReference: row.payment_reference,
    amountSgd: Number(row.amount_sgd),
    required,
    status: row.kyc_status,
    customer: {
      name: row.customer_name,
      email: row.customer_email,
      dob: row.customer_dob,
      gender: row.customer_gender,
      countryCode: row.customer_country_code,
    },
    singpass: {
      nric: row.singpass_nric,
      status: row.singpass_status,
      matchedName: toBool(row.matched_name),
      matchedDob: toBool(row.matched_dob),
      matchedEmail: toBool(row.matched_email),
      reason: row.singpass_reason,
      verifiedAt: row.singpass_verified_at,
    },
    poi: {
      fileName: row.poi_file_name,
      fileType: row.poi_file_type,
      fileSizeBytes: row.poi_file_size_bytes,
      status: row.poi_status,
      previewDataUrl: row.poi_preview_data_url,
      declinedReason: row.poi_declined_reason,
      uploadedAt: row.poi_uploaded_at,
      reviewedAt: row.poi_reviewed_at,
    },
    risk: row.risk_level ? {
      riskLevel: row.risk_level,
      decision: row.risk_decision,
      rules: parseRiskRules(row.risk_rules),
    } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseRiskRules(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

export async function ensureKycSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_kyc_cases (
      case_id varchar(36) NOT NULL,
      payment_id varchar(36) NOT NULL,
      customer_name varchar(255) DEFAULT NULL,
      customer_email varchar(150) DEFAULT NULL,
      customer_dob date DEFAULT NULL,
      customer_gender varchar(64) DEFAULT NULL,
      customer_country_code char(2) DEFAULT NULL,
      singpass_nric varchar(16) DEFAULT NULL,
      singpass_status enum('NOT_STARTED','VERIFIED','FAILED') NOT NULL DEFAULT 'NOT_STARTED',
      matched_name tinyint(1) NOT NULL DEFAULT 0,
      matched_dob tinyint(1) NOT NULL DEFAULT 0,
      matched_email tinyint(1) NOT NULL DEFAULT 0,
      singpass_reason text DEFAULT NULL,
      singpass_verified_at timestamp NULL DEFAULT NULL,
      poi_file_name varchar(255) DEFAULT NULL,
      poi_file_type varchar(128) DEFAULT NULL,
      poi_file_size_bytes int DEFAULT NULL,
      poi_preview_data_url longtext DEFAULT NULL,
      poi_status enum('NOT_UPLOADED','PENDING_REVIEW','ACCEPTED','DECLINED') NOT NULL DEFAULT 'NOT_UPLOADED',
      poi_declined_reason text DEFAULT NULL,
      poi_uploaded_at timestamp NULL DEFAULT NULL,
      poi_reviewed_at timestamp NULL DEFAULT NULL,
      kyc_status enum('NOT_REQUIRED','PENDING_CUSTOMER','PENDING_REVIEW','VERIFIED','REJECTED') NOT NULL DEFAULT 'PENDING_CUSTOMER',
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (case_id),
      UNIQUE KEY uq_payment_kyc_cases_payment (payment_id),
      KEY idx_payment_kyc_cases_status (kyc_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kyc_declined_reasons (
      code varchar(16) NOT NULL,
      description text NOT NULL,
      PRIMARY KEY (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    INSERT INTO kyc_declined_reasons (code, description)
    VALUES
      ('SPDR18', 'The uploaded image of the document is blurred, please provide a clear photo of the document'),
      ('SPDR53', 'Document proof is not fully displayed'),
      ('SPDR70', 'Submitted document is expired'),
      ('SPDR76', 'Name on the document is not clearly visible'),
      ('SPDR194', 'The provided document is edited'),
      ('SPDR205', 'Document type is not supported')
    ON DUPLICATE KEY UPDATE description = VALUES(description)
  `)
}

export async function getPaymentKyc(paymentId) {
  const latestRisk = await getLatestRiskAssessment(paymentId)
  const [rows] = await pool.query(
    `SELECT k.*, p.payment_reference, p.amount_sgd
     FROM payments p
     LEFT JOIN payment_kyc_cases k ON k.payment_id = p.payment_id
     WHERE p.payment_id = ?`,
    [paymentId]
  )

  if (rows.length === 0) {
    throw Object.assign(new Error('Payment not found'), { code: 'PAYMENT_NOT_FOUND' })
  }

  const row = rows[0]
  const hasExistingCase = Boolean(row.case_id)
  const required = kycRequiredByRisk(latestRisk) || hasExistingCase
  if (!required) {
    return {
      paymentId,
      paymentReference: row.payment_reference,
      amountSgd: Number(row.amount_sgd),
      required: false,
      status: 'NOT_REQUIRED',
    }
  }

  return mapCase(row, required) || {
    paymentId,
    paymentReference: row.payment_reference,
    amountSgd: Number(row.amount_sgd),
    required,
    status: 'PENDING_CUSTOMER',
  }
}

export async function isPaymentKycVerified(paymentId) {
  const latestRisk = await getLatestRiskAssessment(paymentId)
  const [rows] = await pool.query(
    `SELECT p.amount_sgd, k.kyc_status
     FROM payments p
     LEFT JOIN payment_kyc_cases k ON k.payment_id = p.payment_id
     WHERE p.payment_id = ?`,
    [paymentId]
  )

  if (rows.length === 0) {
    throw Object.assign(new Error('Payment not found'), { code: 'PAYMENT_NOT_FOUND' })
  }

  const required = kycRequiredByRisk(latestRisk) || Boolean(rows[0].kyc_status)
  return !required || rows[0].kyc_status === 'VERIFIED'
}

export async function upsertCustomerProfile(paymentId, input) {
  const latestRisk = await getLatestRiskAssessment(paymentId)
  const [payments] = await pool.query(
    `SELECT payment_id, amount_sgd FROM payments WHERE payment_id = ?`,
    [paymentId]
  )
  if (payments.length === 0) {
    throw Object.assign(new Error('Payment not found'), { code: 'PAYMENT_NOT_FOUND' })
  }
  if (!kycRequiredByRisk(latestRisk)) {
    return getPaymentKyc(paymentId)
  }

  if (!input.name || String(input.name).length < 3) {
    throw Object.assign(new Error('Customer name must be at least 3 characters'), { code: 'INVALID_KYC_INPUT' })
  }
  if (!validateEmail(input.email)) {
    throw Object.assign(new Error('Customer email must be valid'), { code: 'INVALID_KYC_INPUT' })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.dob || ''))) {
    throw Object.assign(new Error('Customer date of birth must use YYYY-MM-DD'), { code: 'INVALID_KYC_INPUT' })
  }

  await pool.query(
    `INSERT INTO payment_kyc_cases (
       case_id, payment_id, customer_name, customer_email, customer_dob,
       customer_gender, customer_country_code, kyc_status
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING_CUSTOMER')
     ON DUPLICATE KEY UPDATE
       customer_name = VALUES(customer_name),
       customer_email = VALUES(customer_email),
       customer_dob = VALUES(customer_dob),
       customer_gender = VALUES(customer_gender),
       customer_country_code = VALUES(customer_country_code),
       kyc_status = CASE
         WHEN kyc_status = 'REJECTED' THEN 'PENDING_CUSTOMER'
         ELSE kyc_status
       END`,
    [
      crypto.randomUUID(),
      paymentId,
      input.name,
      input.email,
      input.dob,
      input.gender || null,
      String(input.countryCode || input.country_code || 'SG').toUpperCase(),
    ]
  )

  return getPaymentKyc(paymentId)
}

export async function uploadPoi(paymentId, input) {
  await upsertCustomerProfile(paymentId, input)

  if (!ACCEPTED_POI_TYPES.has(input.fileType)) {
    throw Object.assign(new Error('POI must be a JPEG or JPG image'), { code: 'INVALID_KYC_INPUT' })
  }
  if (!Number.isFinite(Number(input.fileSizeBytes)) || Number(input.fileSizeBytes) <= 0 || Number(input.fileSizeBytes) > MAX_POI_SIZE_BYTES) {
    throw Object.assign(new Error('POI file must be 3 MB or smaller'), { code: 'INVALID_KYC_INPUT' })
  }
  if (!String(input.previewDataUrl || '').startsWith('data:image/jpeg;base64,')) {
    throw Object.assign(new Error('POI image preview must be a JPEG data URL'), { code: 'INVALID_KYC_INPUT' })
  }

  await pool.query(
    `UPDATE payment_kyc_cases
     SET poi_file_name = ?,
         poi_file_type = ?,
         poi_file_size_bytes = ?,
         poi_preview_data_url = ?,
         poi_status = 'PENDING_REVIEW',
         poi_declined_reason = NULL,
         poi_uploaded_at = CURRENT_TIMESTAMP,
         kyc_status = CASE
           WHEN singpass_status = 'VERIFIED' THEN 'PENDING_REVIEW'
           ELSE 'PENDING_CUSTOMER'
         END
     WHERE payment_id = ?`,
    [input.fileName, input.fileType, Number(input.fileSizeBytes), input.previewDataUrl, paymentId]
  )

  return getPaymentKyc(paymentId)
}

export async function verifyMockSingpass(paymentId) {
  const kyc = await getPaymentKyc(paymentId)
  if (!kyc.required) return kyc
  if (!kyc.customer?.name || !kyc.customer?.email || !kyc.customer?.dob) {
    throw Object.assign(new Error('Customer profile is required before Singpass verification'), { code: 'INVALID_KYC_INPUT' })
  }

  const matchedName = normalize(kyc.customer.name).length >= 3
  const matchedDob = /^\d{4}-\d{2}-\d{2}$/.test(String(kyc.customer.dob))
  const matchedEmail = validateEmail(kyc.customer.email)
  const verified = matchedName && matchedDob && matchedEmail
  const reason = verified ? null : 'Mock Singpass profile does not match the submitted customer details'

  await pool.query(
    `UPDATE payment_kyc_cases
     SET singpass_nric = ?,
         singpass_status = ?,
         matched_name = ?,
         matched_dob = ?,
         matched_email = ?,
         singpass_reason = ?,
         singpass_verified_at = CURRENT_TIMESTAMP,
         kyc_status = CASE
           WHEN ? = 'VERIFIED' AND poi_status = 'PENDING_REVIEW' THEN 'PENDING_REVIEW'
           WHEN ? = 'VERIFIED' AND poi_status = 'ACCEPTED' THEN 'VERIFIED'
           WHEN ? = 'VERIFIED' THEN 'PENDING_CUSTOMER'
           ELSE 'REJECTED'
         END
     WHERE payment_id = ?`,
    [
      `DEMO${crypto.createHash('sha256').update(paymentId).digest('hex').slice(0, 8).toUpperCase()}`,
      verified ? 'VERIFIED' : 'FAILED',
      matchedName,
      matchedDob,
      matchedEmail,
      reason,
      verified ? 'VERIFIED' : 'FAILED',
      verified ? 'VERIFIED' : 'FAILED',
      verified ? 'VERIFIED' : 'FAILED',
      paymentId,
    ]
  )

  return getPaymentKyc(paymentId)
}

export async function reviewPoi(paymentId, input) {
  const status = String(input.status || '').toUpperCase()
  if (!['ACCEPTED', 'DECLINED'].includes(status)) {
    throw Object.assign(new Error('Review status must be ACCEPTED or DECLINED'), { code: 'INVALID_KYC_INPUT' })
  }
  if (status === 'DECLINED' && !input.reason) {
    throw Object.assign(new Error('Declined POI requires a reason'), { code: 'INVALID_KYC_INPUT' })
  }

  const nextKycStatus = status === 'ACCEPTED' ? 'VERIFIED' : 'REJECTED'
  await pool.query(
    `UPDATE payment_kyc_cases
     SET poi_status = ?,
         poi_declined_reason = ?,
         poi_reviewed_at = CURRENT_TIMESTAMP,
         kyc_status = CASE
           WHEN ? = 'ACCEPTED' AND singpass_status = 'VERIFIED' THEN 'VERIFIED'
           WHEN ? = 'ACCEPTED' THEN 'PENDING_CUSTOMER'
           ELSE 'REJECTED'
         END
     WHERE payment_id = ?`,
    [status, status === 'ACCEPTED' ? null : input.reason, status, status, paymentId]
  )

  const kyc = await getPaymentKyc(paymentId)
  if (kyc.status === 'VERIFIED') {
    await pool.query(
      `UPDATE payments
       SET status = CASE
         WHEN status IN ('KYC_REQUIRED', 'MANUAL_REVIEW_REQUIRED') THEN 'AWAITING_CRYPTO_SELECTION'
         ELSE status
       END
       WHERE payment_id = ?`,
      [paymentId]
    )
  }

  return kyc
}

export async function listKycCases() {
  const [rows] = await pool.query(
    `SELECT
       k.*,
       p.payment_reference,
       p.amount_sgd,
       r.risk_level,
       r.decision AS risk_decision,
       r.reasons AS risk_rules
     FROM payment_kyc_cases k
     JOIN payments p ON p.payment_id = k.payment_id
     LEFT JOIN risk_assessments r
       ON r.risk_assessment_id = (
         SELECT r2.risk_assessment_id
         FROM risk_assessments r2
         WHERE r2.payment_id = p.payment_id
         ORDER BY r2.created_at DESC
         LIMIT 1
       )
     ORDER BY k.updated_at DESC`
  )
  return rows.map(mapCase)
}

export async function listDeclinedReasons() {
  const [rows] = await pool.query(
    `SELECT code, description FROM kyc_declined_reasons ORDER BY code`
  )
  return rows
}
