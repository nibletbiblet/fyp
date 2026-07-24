import pool from '../config/db.js'
import { env } from '../config/env.js'
import stripe from '../config/stripe.js'

const parseRequirements = (requirements) => ({
  currentlyDue: requirements?.currently_due || [],
  disabledReason: requirements?.disabled_reason || null,
})

const getStoredCurrentlyDue = (value) => {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const getOnboardingStatus = ({ detailsSubmitted, payoutsEnabled, currentlyDue, disabledReason }) => {
  if (detailsSubmitted && payoutsEnabled && currentlyDue.length === 0 && !disabledReason) return 'COMPLETE'
  if (detailsSubmitted || disabledReason) return 'RESTRICTED'
  return 'INCOMPLETE'
}

const optionalString = (value) => {
  const normalized = String(value || '').trim()
  return normalized || undefined
}

const buildStripeMerchantPayload = (merchant) => {
  const businessName = optionalString(merchant.name)
  const uen = optionalString(merchant.bank_account_label)
  const metadata = {
    merchantId: String(merchant.id),
    businessName: businessName || '',
    uen: uen || '',
    bankName: merchant.bank_name || '',
    bankAccountHolder: merchant.account_holder_name || '',
    bankAccountLast4: merchant.account_last4 || '',
    environment: 'fyp-sandbox',
  }

  return {
    businessProfile: {
      name: businessName,
      product_description: 'ChainForge crypto payment gateway merchant payout account',
    },
    company: {
      name: businessName,
      tax_id: uen,
    },
    metadata,
  }
}

async function syncStripeAccountFromMerchant(merchant, { includeLegalFields = false } = {}) {
  if (!merchant.stripe_connected_account_id) return

  const payload = buildStripeMerchantPayload(merchant)
  const updateParams = {
    business_profile: payload.businessProfile,
    metadata: payload.metadata,
  }

  if (includeLegalFields) {
    updateParams.company = payload.company
  }

  await stripe.accounts.update(merchant.stripe_connected_account_id, updateParams)
}

export const isStripePayoutSetupComplete = (merchant) => Boolean(
  merchant?.stripe_connected_account_id
    && Number(merchant?.stripe_details_submitted) === 1
    && Number(merchant?.stripe_payouts_enabled) === 1
    && (!merchant?.stripe_requirements_disabled_reason)
    && getStoredCurrentlyDue(merchant?.stripe_requirements_currently_due).length === 0,
)

export async function ensureStripeConnectedAccountForMerchant(merchantId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT
       id,
       name,
       email,
       bank_name,
       account_holder_name,
       account_last4,
       bank_account_label,
       stripe_connected_account_id
     FROM merchants
     WHERE id = ?
     LIMIT 1`,
    [merchantId],
  )
  if (rows.length === 0) {
    throw Object.assign(new Error('Merchant not found'), { code: 'MERCHANT_NOT_FOUND' })
  }

  const merchant = rows[0]
  if (merchant.stripe_connected_account_id) {
    const account = await stripe.accounts.retrieve(merchant.stripe_connected_account_id)
    await syncStripeAccountFromMerchant(merchant, { includeLegalFields: !account.details_submitted })
    return merchant.stripe_connected_account_id
  }

  const payload = buildStripeMerchantPayload(merchant)
  const account = await stripe.accounts.create({
    type: 'express',
    country: env.stripe.connectCountry,
    email: merchant.email,
    business_type: 'company',
    capabilities: {
      transfers: { requested: true },
    },
    business_profile: payload.businessProfile,
    company: payload.company,
    metadata: payload.metadata,
  })

  await conn.query(
    `UPDATE merchants
     SET stripe_connected_account_id = ?,
         stripe_onboarding_status = 'INCOMPLETE',
         stripe_status_synced_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [account.id, merchant.id],
  )

  await conn.query(
    `INSERT INTO audit_logs (merchant_id, actor_type, actor_id, action, details)
     VALUES (?, 'SYSTEM', 'STRIPE_CONNECT', 'STRIPE_CONNECTED_ACCOUNT_CREATED', ?)`,
    [
      merchant.id,
      JSON.stringify({
        stripeConnectedAccountId: account.id,
        mode: 'sandbox',
        syncedFromMerchantOnboarding: {
          businessName: merchant.name,
          uen: merchant.bank_account_label || null,
          bankName: merchant.bank_name || null,
          bankAccountHolder: merchant.account_holder_name || null,
          bankAccountLast4: merchant.account_last4 || null,
        },
      }),
    ],
  )

  return account.id
}

export async function refreshStripeAccountStatus(merchantId) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const accountId = await ensureStripeConnectedAccountForMerchant(merchantId, conn)
    const account = await stripe.accounts.retrieve(accountId)
    const { currentlyDue, disabledReason } = parseRequirements(account.requirements)
    const detailsSubmitted = Boolean(account.details_submitted)
    const payoutsEnabled = Boolean(account.payouts_enabled)
    const chargesEnabled = Boolean(account.charges_enabled)
    const onboardingStatus = getOnboardingStatus({
      detailsSubmitted,
      payoutsEnabled,
      currentlyDue,
      disabledReason,
    })

    await conn.query(
      `UPDATE merchants
       SET stripe_details_submitted = ?,
           stripe_payouts_enabled = ?,
           stripe_charges_enabled = ?,
           stripe_requirements_currently_due = ?,
           stripe_requirements_disabled_reason = ?,
           stripe_onboarding_status = ?,
           stripe_status_synced_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        detailsSubmitted ? 1 : 0,
        payoutsEnabled ? 1 : 0,
        chargesEnabled ? 1 : 0,
        JSON.stringify(currentlyDue),
        disabledReason,
        onboardingStatus,
        merchantId,
      ],
    )

    if (onboardingStatus === 'COMPLETE') {
      const [heldRows] = await conn.query(
        `SELECT settlement_id, payment_id
         FROM settlements
         WHERE merchant_id = ? AND status = 'HELD' AND payout_id IS NULL
         FOR UPDATE`,
        [merchantId],
      )

      if (heldRows.length > 0) {
        await conn.query(
          `UPDATE settlements
           SET status = 'ELIGIBLE',
               failure_reason = NULL
           WHERE merchant_id = ? AND status = 'HELD' AND payout_id IS NULL`,
          [merchantId],
        )

        for (const settlement of heldRows) {
          await conn.query(
            `INSERT INTO audit_logs (merchant_id, payment_id, settlement_id, actor_type, actor_id, action, details)
             VALUES (?, ?, ?, 'SYSTEM', 'STRIPE_CONNECT', 'SETTLEMENT_RELEASED_AFTER_PAYOUT_SETUP', ?)`,
            [
              merchantId,
              settlement.payment_id,
              settlement.settlement_id,
              JSON.stringify({ stripeConnectedAccountId: accountId }),
            ],
          )
        }
      }
    }

    await conn.commit()
    return {
      stripeConnectedAccountId: accountId,
      detailsSubmitted,
      payoutsEnabled,
      chargesEnabled,
      currentlyDue,
      disabledReason,
      onboardingStatus,
      payoutSetupComplete: onboardingStatus === 'COMPLETE',
    }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function createStripeOnboardingLink(merchantId) {
  const accountId = await ensureStripeConnectedAccountForMerchant(merchantId)
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: new URL('/merchant/stripe/refresh', env.corsOrigin).toString(),
    return_url: new URL('/merchant/stripe/return', env.corsOrigin).toString(),
    type: 'account_onboarding',
  })

  await pool.query(
    `INSERT INTO audit_logs (merchant_id, actor_type, actor_id, action, details)
     VALUES (?, 'MERCHANT', ?, 'STRIPE_ONBOARDING_LINK_CREATED', ?)`,
    [merchantId, merchantId, JSON.stringify({ stripeConnectedAccountId: accountId })],
  )

  return {
    url: accountLink.url,
    stripeConnectedAccountId: accountId,
  }
}
