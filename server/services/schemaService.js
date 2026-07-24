import bcrypt from 'bcrypt'
import pool from '../config/db.js'
import { env } from '../config/env.js'

const tableExists = async (tableName) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  )
  return Number(rows[0]?.count || 0) > 0
}

const columnExists = async (tableName, columnName) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tableName, columnName]
  )
  return Number(rows[0]?.count || 0) > 0
}

const getColumnSqlType = async (tableName, columnName) => {
  const [rows] = await pool.query(
    `SELECT COLUMN_TYPE AS column_type
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
     LIMIT 1`,
    [tableName, columnName]
  )
  return rows[0]?.column_type ? String(rows[0].column_type).toUpperCase() : null
}

const getLegacyTableName = async (baseName) => {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  let name = `legacy_mock_${baseName}_${stamp}`
  let suffix = 1

  while (await tableExists(name)) {
    name = `legacy_mock_${baseName}_${stamp}_${suffix}`
    suffix += 1
  }

  return name
}

const archiveConflictingTable = async (tableName, requiredColumn) => {
  if (!(await tableExists(tableName))) return
  if (await columnExists(tableName, requiredColumn)) return

  const legacyName = await getLegacyTableName(tableName)
  await pool.query(`RENAME TABLE \`${tableName}\` TO \`${legacyName}\``)
  console.log(`Archived old ${tableName} table as ${legacyName}`)
}

const addColumnIfMissing = async (tableName, columnName, definition) => {
  if (!(await tableExists(tableName))) return
  if (await columnExists(tableName, columnName)) return
  await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`)
}

const renameColumnIfNeeded = async (tableName, oldColumnName, newColumnName, definition) => {
  if (!(await tableExists(tableName))) return
  if (!(await columnExists(tableName, oldColumnName)) || await columnExists(tableName, newColumnName)) return
  await pool.query(`ALTER TABLE \`${tableName}\` CHANGE COLUMN \`${oldColumnName}\` \`${newColumnName}\` ${definition}`)
}

const createCoreTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchants (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(150) NOT NULL,
      bank_name VARCHAR(100) DEFAULT NULL,
      account_holder_name VARCHAR(255) DEFAULT NULL,
      account_last4 VARCHAR(4) DEFAULT NULL,
      bank_account_label VARCHAR(64) DEFAULT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE_UNVERIFIED',
      kyc_status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
      container_id VARCHAR(64) DEFAULT NULL,
      wallet_id VARCHAR(64) DEFAULT NULL,
      stripe_connected_account_id VARCHAR(128) DEFAULT NULL,
      stripe_onboarding_status VARCHAR(40) NOT NULL DEFAULT 'NOT_STARTED',
      stripe_details_submitted TINYINT(1) NOT NULL DEFAULT 0,
      stripe_payouts_enabled TINYINT(1) NOT NULL DEFAULT 0,
      stripe_charges_enabled TINYINT(1) NOT NULL DEFAULT 0,
      stripe_requirements_currently_due JSON DEFAULT NULL,
      stripe_requirements_disabled_reason VARCHAR(255) DEFAULT NULL,
      stripe_status_synced_at TIMESTAMP NULL DEFAULT NULL,
      payout_enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_merchants_email (email),
      UNIQUE KEY uq_merchants_bank_account_label (bank_account_label),
      KEY idx_merchants_status (status),
      KEY idx_merchants_kyc_status (kyc_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchant_users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      merchant_id INT UNSIGNED NOT NULL,
      email VARCHAR(150) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      password_salt VARCHAR(64) NOT NULL,
      full_name VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_merchant_users_email (email),
      KEY idx_merchant_users_merchant (merchant_id),
      CONSTRAINT fk_merchant_users_merchants
        FOREIGN KEY (merchant_id) REFERENCES merchants (id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  const merchantIdSqlType = await getColumnSqlType('merchants', 'id') || 'INT'

  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchant_fee_profiles (
      merchant_id ${merchantIdSqlType} NOT NULL,
      platform_fee_rate DECIMAL(8,6) NOT NULL DEFAULT 0.015000,
      maximum_total_rate DECIMAL(8,6) NOT NULL DEFAULT 0.030000,
      settlement_delay_days INT NOT NULL DEFAULT 1,
      settlement_currency VARCHAR(3) NOT NULL DEFAULT 'SGD',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (merchant_id),
      CONSTRAINT fk_merchant_fee_profiles_merchants
        FOREIGN KEY (merchant_id) REFERENCES merchants (id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      admin_user_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      email VARCHAR(150) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      role VARCHAR(40) NOT NULL DEFAULT 'SUPER_ADMIN',
      status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
      last_login_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (admin_user_id),
      UNIQUE KEY uq_admin_users_email (email),
      KEY idx_admin_users_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS supported_assets (
      supported_asset_id VARCHAR(36) NOT NULL,
      crypto_symbol VARCHAR(32) NOT NULL,
      network VARCHAR(64) NOT NULL,
      asset_type VARCHAR(20) NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      token_symbol VARCHAR(20) DEFAULT NULL,
      contract_address VARCHAR(128) DEFAULT NULL,
      chain_id INT UNSIGNED DEFAULT NULL,
      decimals TINYINT UNSIGNED NOT NULL,
      min_confirmations INT UNSIGNED NOT NULL DEFAULT 1,
      provider_module VARCHAR(100) NOT NULL,
      is_testnet TINYINT(1) NOT NULL DEFAULT 1,
      is_enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (supported_asset_id),
      UNIQUE KEY uq_supported_assets_crypto_network (crypto_symbol, network),
      KEY idx_supported_assets_enabled (is_enabled)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      payment_id VARCHAR(36) NOT NULL,
      merchant_id INT UNSIGNED NOT NULL,
      payment_reference VARCHAR(64) NOT NULL,
      merchant_order_reference VARCHAR(100) DEFAULT NULL,
      description VARCHAR(500) DEFAULT NULL,
      customer_reference VARCHAR(100) DEFAULT NULL,
      amount_sgd DECIMAL(12,2) NOT NULL,
      supported_asset_id VARCHAR(36) DEFAULT NULL,
      crypto_symbol_snapshot VARCHAR(32) DEFAULT NULL,
      network_snapshot VARCHAR(64) DEFAULT NULL,
      expected_crypto_amount DECIMAL(36,18) DEFAULT NULL,
      received_crypto_amount DECIMAL(36,18) NOT NULL DEFAULT 0,
      quoted_rate_sgd_per_crypto DECIMAL(36,18) DEFAULT NULL,
      quote_expires_at TIMESTAMP NULL DEFAULT NULL,
      amount_tolerance_bps INT UNSIGNED NOT NULL DEFAULT 100,
      receiving_address VARCHAR(128) DEFAULT NULL,
      qr_code_data TEXT DEFAULT NULL,
      payment_instructions JSON DEFAULT NULL,
      provider_name VARCHAR(100) NOT NULL DEFAULT 'MOCK_MAS_LICENSED_PROVIDER',
      provider_reference VARCHAR(128) DEFAULT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'CREATED',
      crypto_selected_at TIMESTAMP NULL DEFAULT NULL,
      qr_generated_at TIMESTAMP NULL DEFAULT NULL,
      payment_detected_at TIMESTAMP NULL DEFAULT NULL,
      confirmed_at TIMESTAMP NULL DEFAULT NULL,
      converted_at TIMESTAMP NULL DEFAULT NULL,
      settled_at TIMESTAMP NULL DEFAULT NULL,
      paid_out_at TIMESTAMP NULL DEFAULT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (payment_id),
      UNIQUE KEY uq_payments_reference (payment_reference),
      KEY idx_payments_merchant_status (merchant_id, status),
      KEY idx_payments_supported_asset (supported_asset_id),
      KEY idx_payments_expires_at (expires_at),
      KEY idx_payments_created_at (created_at),
      CONSTRAINT fk_payments_merchants
        FOREIGN KEY (merchant_id) REFERENCES merchants (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_payments_supported_assets
        FOREIGN KEY (supported_asset_id) REFERENCES supported_assets (supported_asset_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blockchain_transactions (
      blockchain_transaction_id VARCHAR(36) NOT NULL,
      payment_id VARCHAR(36) NOT NULL,
      supported_asset_id VARCHAR(36) NOT NULL,
      crypto_symbol_snapshot VARCHAR(32) NOT NULL,
      network_snapshot VARCHAR(64) NOT NULL,
      tx_hash VARCHAR(128) NOT NULL,
      event_index INT UNSIGNED NOT NULL DEFAULT 0,
      from_address VARCHAR(128) DEFAULT NULL,
      to_address VARCHAR(128) DEFAULT NULL,
      amount_crypto DECIMAL(36,18) NOT NULL,
      confirmations INT UNSIGNED NOT NULL DEFAULT 0,
      required_confirmations INT UNSIGNED NOT NULL DEFAULT 1,
      block_number BIGINT UNSIGNED DEFAULT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'DETECTED',
      raw_payload JSON DEFAULT NULL,
      detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      confirmed_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (blockchain_transaction_id),
      UNIQUE KEY uq_blockchain_transactions_asset_tx_event (supported_asset_id, tx_hash, event_index),
      KEY idx_blockchain_transactions_payment (payment_id),
      KEY idx_blockchain_transactions_status (status),
      CONSTRAINT fk_blockchain_transactions_payments
        FOREIGN KEY (payment_id) REFERENCES payments (payment_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_blockchain_transactions_supported_assets
        FOREIGN KEY (supported_asset_id) REFERENCES supported_assets (supported_asset_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchant_payouts (
      payout_id VARCHAR(36) NOT NULL,
      merchant_id INT UNSIGNED NOT NULL,
      payout_reference VARCHAR(100) NOT NULL,
      gross_sgd_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      payout_fee_sgd DECIMAL(12,2) NOT NULL DEFAULT 0,
      net_payout_sgd_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      payout_method VARCHAR(40) NOT NULL DEFAULT 'BANK_TRANSFER_SIMULATED',
      bank_name VARCHAR(100) DEFAULT NULL,
      bank_account_last4 VARCHAR(4) DEFAULT NULL,
      provider_name VARCHAR(100) NOT NULL DEFAULT 'MOCK_MAS_LICENSED_PROVIDER',
      provider_reference VARCHAR(128) DEFAULT NULL,
      stripe_transfer_id VARCHAR(128) DEFAULT NULL,
      stripe_payout_id VARCHAR(128) DEFAULT NULL,
      idempotency_key VARCHAR(128) DEFAULT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'NOT_READY',
      requested_at TIMESTAMP NULL DEFAULT NULL,
      processing_started_at TIMESTAMP NULL DEFAULT NULL,
      paid_out_at TIMESTAMP NULL DEFAULT NULL,
      failed_at TIMESTAMP NULL DEFAULT NULL,
      failure_reason VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (payout_id),
      UNIQUE KEY uq_merchant_payouts_reference (payout_reference),
      UNIQUE KEY uq_merchant_payouts_idempotency (idempotency_key),
      KEY idx_merchant_payouts_merchant_status (merchant_id, status),
      CONSTRAINT fk_merchant_payouts_merchants
        FOREIGN KEY (merchant_id) REFERENCES merchants (id)
        ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crypto_conversions (
      conversion_id VARCHAR(36) NOT NULL,
      payment_id VARCHAR(36) NOT NULL,
      merchant_id ${merchantIdSqlType} NOT NULL,
      crypto_currency VARCHAR(32) NOT NULL DEFAULT 'ETH',
      crypto_amount DECIMAL(36,18) NOT NULL DEFAULT 0,
      fiat_currency VARCHAR(8) NOT NULL DEFAULT 'SGD',
      quoted_fiat_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      quote_exchange_rate DECIMAL(36,18) DEFAULT NULL,
      conversion_exchange_rate DECIMAL(36,18) DEFAULT NULL,
      actual_fiat_proceeds DECIMAL(12,2) DEFAULT NULL,
      conversion_gain_loss DECIMAL(12,2) DEFAULT NULL,
      rate_source VARCHAR(100) NOT NULL DEFAULT 'Coingecko ETH/SGD',
      faucet_return_address VARCHAR(128) DEFAULT NULL,
      faucet_return_tx_hash VARCHAR(128) DEFAULT NULL,
      returned_amount DECIMAL(36,18) DEFAULT NULL,
      returned_at TIMESTAMP NULL DEFAULT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
      converted_at TIMESTAMP NULL DEFAULT NULL,
      failure_reason VARCHAR(255) DEFAULT NULL,
      retry_count INT UNSIGNED NOT NULL DEFAULT 0,
      last_retry_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (conversion_id),
      UNIQUE KEY uq_crypto_conversions_payment (payment_id),
      KEY idx_crypto_conversions_merchant_status (merchant_id, status),
      CONSTRAINT fk_crypto_conversions_payments
        FOREIGN KEY (payment_id) REFERENCES payments (payment_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_crypto_conversions_merchants
        FOREIGN KEY (merchant_id) REFERENCES merchants (id)
        ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settlements (
      settlement_id VARCHAR(36) NOT NULL,
      payment_id VARCHAR(36) NOT NULL,
      merchant_id INT UNSIGNED NOT NULL,
      payout_id VARCHAR(36) DEFAULT NULL,
      gross_sgd_amount DECIMAL(12,2) NOT NULL,
      provider_fee_sgd DECIMAL(12,2) NOT NULL DEFAULT 0,
      platform_fee_sgd DECIMAL(12,2) NOT NULL DEFAULT 0,
      conversion_cost_sgd DECIMAL(12,2) NOT NULL DEFAULT 0,
      network_fee_sgd DECIMAL(12,2) NOT NULL DEFAULT 0,
      buffer_reserved_sgd DECIMAL(12,2) NOT NULL DEFAULT 0,
      buffer_released_sgd DECIMAL(12,2) NOT NULL DEFAULT 0,
      net_settlement_sgd_amount DECIMAL(12,2) NOT NULL,
      conversion_rate DECIMAL(36,18) DEFAULT NULL,
      provider_name VARCHAR(100) NOT NULL DEFAULT 'MOCK_MAS_LICENSED_PROVIDER',
      provider_reference VARCHAR(128) DEFAULT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'PENDING_CONVERSION',
      converted_at TIMESTAMP NULL DEFAULT NULL,
      settled_at TIMESTAMP NULL DEFAULT NULL,
      paid_out_at TIMESTAMP NULL DEFAULT NULL,
      failed_at TIMESTAMP NULL DEFAULT NULL,
      failure_reason VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (settlement_id),
      UNIQUE KEY uq_settlements_payment (payment_id),
      KEY idx_settlements_merchant_status (merchant_id, status),
      KEY idx_settlements_payout (payout_id),
      CONSTRAINT fk_settlements_payments
        FOREIGN KEY (payment_id) REFERENCES payments (payment_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_settlements_merchants
        FOREIGN KEY (merchant_id) REFERENCES merchants (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_settlements_merchant_payouts
        FOREIGN KEY (payout_id) REFERENCES merchant_payouts (payout_id)
        ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settlement_batches (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      merchant_id ${merchantIdSqlType} NOT NULL,
      settlement_date DATE NOT NULL,
      gross_amount_cents BIGINT NOT NULL,
      platform_fee_cents BIGINT NOT NULL,
      conversion_cost_cents BIGINT NOT NULL DEFAULT 0,
      network_fee_cents BIGINT NOT NULL DEFAULT 0,
      buffer_reserved_cents BIGINT NOT NULL DEFAULT 0,
      buffer_released_cents BIGINT NOT NULL DEFAULT 0,
      absorbed_by_chainforge_cents BIGINT NOT NULL DEFAULT 0,
      net_amount_cents BIGINT NOT NULL,
      stripe_transfer_id VARCHAR(255) DEFAULT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
      failure_reason TEXT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_settlement_batches_merchant_date (merchant_id, settlement_date),
      KEY idx_settlement_batches_status (status),
      CONSTRAINT fk_settlement_batches_merchants
        FOREIGN KEY (merchant_id) REFERENCES merchants (id)
        ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      audit_log_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      merchant_id INT UNSIGNED DEFAULT NULL,
      payment_id VARCHAR(36) DEFAULT NULL,
      blockchain_transaction_id VARCHAR(36) DEFAULT NULL,
      settlement_id VARCHAR(36) DEFAULT NULL,
      payout_id VARCHAR(36) DEFAULT NULL,
      actor_type VARCHAR(40) NOT NULL,
      actor_id VARCHAR(36) DEFAULT NULL,
      action VARCHAR(100) NOT NULL,
      details JSON DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (audit_log_id),
      KEY idx_audit_logs_merchant_created (merchant_id, created_at),
      KEY idx_audit_logs_payment_created (payment_id, created_at),
      KEY idx_audit_logs_action (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

const seedSupportedAssets = async () => {
  await pool.query(
    `INSERT INTO supported_assets (
       supported_asset_id, crypto_symbol, network, asset_type, display_name,
       token_symbol, contract_address, chain_id, decimals, min_confirmations,
       provider_module, is_testnet, is_enabled
     ) VALUES
       ('asset-btc-testnet', 'BTC', 'BTC_TESTNET', 'NATIVE', 'Bitcoin Testnet', 'tBTC', NULL, NULL, 8, 2, 'btcTestnetProvider', 1, 1),
       ('asset-eth-sepolia', 'ETH', 'ETH_SEPOLIA', 'NATIVE', 'Sepolia ETH', 'ETH', NULL, 11155111, 18, 1, 'ethSepoliaProvider', 1, 1),
       ('asset-stablecoin-sepolia', 'TEST_STABLECOIN', 'STABLECOIN_SEPOLIA', 'ERC20', 'Sepolia Test Stablecoin', 'tUSDC', '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', 11155111, 6, 1, 'stablecoinSepoliaProvider', 1, 1)
     ON DUPLICATE KEY UPDATE
       display_name = VALUES(display_name),
       token_symbol = VALUES(token_symbol),
       contract_address = VALUES(contract_address),
       chain_id = VALUES(chain_id),
       decimals = VALUES(decimals),
       min_confirmations = VALUES(min_confirmations),
       provider_module = VALUES(provider_module),
       is_testnet = VALUES(is_testnet),
       is_enabled = VALUES(is_enabled)`
  )
}

const migrateCoreTables = async () => {
  await addColumnIfMissing('merchants', 'container_id', '`container_id` VARCHAR(64) DEFAULT NULL AFTER `kyc_status`')
  await addColumnIfMissing('merchants', 'wallet_id', '`wallet_id` VARCHAR(64) DEFAULT NULL AFTER `container_id`')
  await addColumnIfMissing('merchants', 'stripe_connected_account_id', '`stripe_connected_account_id` VARCHAR(128) DEFAULT NULL AFTER `wallet_id`')
  await addColumnIfMissing('merchants', 'stripe_onboarding_status', "`stripe_onboarding_status` VARCHAR(40) NOT NULL DEFAULT 'NOT_STARTED' AFTER `stripe_connected_account_id`")
  await addColumnIfMissing('merchants', 'stripe_details_submitted', '`stripe_details_submitted` TINYINT(1) NOT NULL DEFAULT 0 AFTER `stripe_onboarding_status`')
  await addColumnIfMissing('merchants', 'stripe_payouts_enabled', '`stripe_payouts_enabled` TINYINT(1) NOT NULL DEFAULT 0 AFTER `stripe_details_submitted`')
  await addColumnIfMissing('merchants', 'stripe_charges_enabled', '`stripe_charges_enabled` TINYINT(1) NOT NULL DEFAULT 0 AFTER `stripe_payouts_enabled`')
  await addColumnIfMissing('merchants', 'stripe_requirements_currently_due', '`stripe_requirements_currently_due` JSON DEFAULT NULL AFTER `stripe_charges_enabled`')
  await addColumnIfMissing('merchants', 'stripe_requirements_disabled_reason', '`stripe_requirements_disabled_reason` VARCHAR(255) DEFAULT NULL AFTER `stripe_requirements_currently_due`')
  await addColumnIfMissing('merchants', 'stripe_status_synced_at', '`stripe_status_synced_at` TIMESTAMP NULL DEFAULT NULL AFTER `stripe_requirements_disabled_reason`')
  await addColumnIfMissing('merchants', 'payout_enabled', '`payout_enabled` TINYINT(1) NOT NULL DEFAULT 1 AFTER `stripe_status_synced_at`')
  await addColumnIfMissing('merchant_payouts', 'stripe_transfer_id', '`stripe_transfer_id` VARCHAR(128) DEFAULT NULL AFTER `provider_reference`')
  await addColumnIfMissing('merchant_payouts', 'stripe_payout_id', '`stripe_payout_id` VARCHAR(128) DEFAULT NULL AFTER `stripe_transfer_id`')
  await addColumnIfMissing('merchant_payouts', 'idempotency_key', '`idempotency_key` VARCHAR(128) DEFAULT NULL AFTER `stripe_payout_id`')
  await addColumnIfMissing('settlements', 'paid_out_at', '`paid_out_at` TIMESTAMP NULL DEFAULT NULL AFTER `settled_at`')
  await addColumnIfMissing('settlements', 'conversion_cost_sgd', '`conversion_cost_sgd` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `platform_fee_sgd`')
  await addColumnIfMissing('settlements', 'network_fee_sgd', '`network_fee_sgd` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `conversion_cost_sgd`')
  await addColumnIfMissing('settlements', 'buffer_reserved_sgd', '`buffer_reserved_sgd` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `network_fee_sgd`')
  await addColumnIfMissing('settlements', 'buffer_released_sgd', '`buffer_released_sgd` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `buffer_reserved_sgd`')
  if (await tableExists('settlements')) {
    await pool.query(
      `ALTER TABLE settlements
       MODIFY COLUMN status VARCHAR(40) NOT NULL DEFAULT 'PENDING_CONVERSION'`,
    )
  }
  if (await tableExists('payments')) {
    await pool.query(
      `ALTER TABLE payments
       MODIFY COLUMN status VARCHAR(40) NOT NULL DEFAULT 'CREATED'`,
    )
  }
  if (await tableExists('merchant_payouts')) {
    await pool.query(
      `ALTER TABLE merchant_payouts
       MODIFY COLUMN status VARCHAR(40) NOT NULL DEFAULT 'NOT_READY'`,
    )
  }
  if (await tableExists('merchant_fee_profiles') && await tableExists('merchants')) {
    await pool.query(
      `INSERT IGNORE INTO merchant_fee_profiles (merchant_id)
       SELECT id FROM merchants`,
    )
  }
}

const seedDefaultAdmin = async () => {
  if (!env.admin.email || !env.admin.password) return

  const [existing] = await pool.query(
    `SELECT admin_user_id FROM admin_users WHERE email = ? LIMIT 1`,
    [env.admin.email]
  )
  if (existing.length > 0) return

  const passwordHash = await bcrypt.hash(env.admin.password, 10)
  const [result] = await pool.query(
    `INSERT INTO admin_users (email, password_hash, full_name, role, status)
     VALUES (?, ?, ?, 'SUPER_ADMIN', 'ACTIVE')`,
    [env.admin.email, passwordHash, env.admin.fullName]
  )

  await pool.query(
    `INSERT INTO audit_logs (actor_type, actor_id, action, details)
     VALUES ('ADMIN', ?, 'ADMIN_USER_SEEDED', ?)`,
    [result.insertId, JSON.stringify({ email: env.admin.email, role: 'SUPER_ADMIN' })]
  )

  console.log(`Seeded platform admin user: ${env.admin.email}`)
}

export async function ensureMainSchema() {
  await archiveConflictingTable('merchants', 'id')
  await archiveConflictingTable('merchant_users', 'id')
  await archiveConflictingTable('admin_users', 'admin_user_id')
  await archiveConflictingTable('supported_assets', 'supported_asset_id')
  await archiveConflictingTable('payments', 'payment_id')
  await archiveConflictingTable('blockchain_transactions', 'blockchain_transaction_id')
  await archiveConflictingTable('merchant_payouts', 'payout_id')
  await archiveConflictingTable('crypto_conversions', 'conversion_id')
  await archiveConflictingTable('settlements', 'settlement_id')
  await archiveConflictingTable('audit_logs', 'audit_log_id')

  await createCoreTables()
  await migrateCoreTables()
  await seedSupportedAssets()
  await seedDefaultAdmin()
}
