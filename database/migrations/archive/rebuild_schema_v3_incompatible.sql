-- ARCHIVED / INCOMPATIBLE / DESTRUCTIVE: do not apply.
-- This rebuild targets an abandoned onboarding design with integer merchants.id,
-- merchant_users, and DROP TABLE statements. The approved baseline is
-- database/schema.sql, which uses merchants.merchant_id UUIDs and one merchant
-- auth record with merchants.password_hash.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `settlements`;
DROP TABLE IF EXISTS `blockchain_transactions`;
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `merchant_payouts`;
DROP TABLE IF EXISTS `supported_assets`;
DROP TABLE IF EXISTS `merchant_users`;
DROP TABLE IF EXISTS `merchants`;

SET FOREIGN_KEY_CHECKS = 1;

-- ── 1. Create merchants table ──
CREATE TABLE `merchants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(150) NOT NULL,
  `bank_name` varchar(100) DEFAULT NULL,
  `account_holder_name` varchar(255) DEFAULT NULL,
  `account_last4` varchar(4) DEFAULT NULL,
  `bank_account_label` varchar(20) DEFAULT NULL, -- UEN
  `status` varchar(50) NOT NULL DEFAULT 'ACTIVE_UNVERIFIED',
  `triplea_merchant_id` varchar(64) DEFAULT NULL,
  `triplea_wallet_id` varchar(64) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_merchants_email` (`email`),
  UNIQUE KEY `uq_merchants_uen` (`bank_account_label`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. Create merchant_users table ──
CREATE TABLE `merchant_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `email` varchar(150) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `password_salt` varchar(64) NOT NULL,
  `full_name` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_merchant_users_email` (`email`),
  KEY `idx_merchant_users_merchant_id` (`merchant_id`),
  CONSTRAINT `fk_merchant_users_merchants` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. Create supported_assets table ──
CREATE TABLE `supported_assets` (
  `supported_asset_id` varchar(36) NOT NULL,
  `crypto_symbol` varchar(32) NOT NULL,
  `network` varchar(64) NOT NULL,
  `asset_type` enum('NATIVE','ERC20') NOT NULL,
  `display_name` varchar(100) NOT NULL,
  `token_symbol` varchar(20) DEFAULT NULL,
  `contract_address` varchar(128) DEFAULT NULL,
  `chain_id` int unsigned DEFAULT NULL,
  `decimals` tinyint unsigned NOT NULL,
  `min_confirmations` int unsigned NOT NULL DEFAULT 1,
  `provider_module` varchar(100) NOT NULL,
  `is_testnet` tinyint(1) NOT NULL DEFAULT 1,
  `is_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`supported_asset_id`),
  UNIQUE KEY `uq_supported_assets_crypto_network` (`crypto_symbol`, `network`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 4. Create merchant_payouts table ──
CREATE TABLE `merchant_payouts` (
  `payout_id` varchar(36) NOT NULL,
  `merchant_id` int NOT NULL,
  `payout_reference` varchar(100) NOT NULL,
  `gross_sgd_amount` decimal(12,2) NOT NULL,
  `payout_fee_sgd` decimal(12,2) NOT NULL DEFAULT '0.00',
  `net_payout_sgd_amount` decimal(12,2) NOT NULL,
  `payout_method` enum('BANK_TRANSFER_SIMULATED') NOT NULL DEFAULT 'BANK_TRANSFER_SIMULATED',
  `bank_name` varchar(100) DEFAULT NULL,
  `bank_account_last4` varchar(4) DEFAULT NULL,
  `provider_name` varchar(100) NOT NULL DEFAULT 'MOCK_MAS_LICENSED_PROVIDER',
  `provider_reference` varchar(128) DEFAULT NULL,
  `status` enum('NOT_READY','PENDING_APPROVAL','PROCESSING','PAID_OUT','FAILED','CANCELLED') NOT NULL DEFAULT 'NOT_READY',
  `requested_at` timestamp NULL DEFAULT NULL,
  `processing_started_at` timestamp NULL DEFAULT NULL,
  `paid_out_at` timestamp NULL DEFAULT NULL,
  `failed_at` timestamp NULL DEFAULT NULL,
  `failure_reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`payout_id`),
  UNIQUE KEY `uq_merchant_payouts_reference` (`payout_reference`),
  KEY `idx_merchant_payouts_merchant_status` (`merchant_id`, `status`),
  CONSTRAINT `fk_merchant_payouts_merchants` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 5. Create payments table ──
CREATE TABLE `payments` (
  `payment_id` varchar(36) NOT NULL,
  `merchant_id` int NOT NULL,
  `payment_reference` varchar(64) NOT NULL,
  `merchant_order_reference` varchar(100) DEFAULT NULL,
  `description` varchar(500) DEFAULT NULL,
  `customer_reference` varchar(100) DEFAULT NULL,
  `amount_sgd` decimal(12,2) NOT NULL,
  `supported_asset_id` varchar(36) DEFAULT NULL,
  `crypto_symbol_snapshot` varchar(32) DEFAULT NULL,
  `network_snapshot` varchar(64) DEFAULT NULL,
  `expected_crypto_amount` decimal(36,18) DEFAULT NULL,
  `received_crypto_amount` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000',
  `quoted_rate_sgd_per_crypto` decimal(36,18) DEFAULT NULL,
  `quote_expires_at` timestamp NULL DEFAULT NULL,
  `amount_tolerance_bps` int unsigned NOT NULL DEFAULT 100,
  `receiving_address` varchar(128) DEFAULT NULL,
  `qr_code_data` text,
  `payment_instructions` json DEFAULT NULL,
  `provider_name` varchar(100) NOT NULL DEFAULT 'MOCK_MAS_LICENSED_PROVIDER',
  `provider_reference` varchar(128) DEFAULT NULL,
  `status` enum(
    'CREATED',
    'AWAITING_CRYPTO_SELECTION',
    'QR_GENERATED',
    'AWAITING_PAYMENT',
    'PAYMENT_DETECTED',
    'CONFIRMING',
    'CONFIRMED',
    'CONVERTED_TO_SGD',
    'SETTLED',
    'PAID_OUT',
    'INSUFFICIENT_FUNDS',
    'UNDERPAID',
    'WRONG_NETWORK',
    'EXPIRED',
    'FAILED',
    'MANUAL_REVIEW_REQUIRED'
  ) NOT NULL DEFAULT 'CREATED',
  `crypto_selected_at` timestamp NULL DEFAULT NULL,
  `qr_generated_at` timestamp NULL DEFAULT NULL,
  `payment_detected_at` timestamp NULL DEFAULT NULL,
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `converted_at` timestamp NULL DEFAULT NULL,
  `settled_at` timestamp NULL DEFAULT NULL,
  `paid_out_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `uq_payments_reference` (`payment_reference`),
  KEY `idx_payments_merchant_order_reference` (`merchant_id`, `merchant_order_reference`),
  KEY `idx_payments_customer_reference` (`customer_reference`),
  KEY `idx_payments_merchant_status` (`merchant_id`, `status`),
  KEY `idx_payments_supported_asset` (`supported_asset_id`),
  KEY `idx_payments_receiving_address` (`receiving_address`),
  CONSTRAINT `fk_payments_merchants` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_payments_supported_assets` FOREIGN KEY (`supported_asset_id`) REFERENCES `supported_assets` (`supported_asset_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 6. Create blockchain_transactions table ──
CREATE TABLE `blockchain_transactions` (
  `blockchain_transaction_id` varchar(36) NOT NULL,
  `payment_id` varchar(36) NOT NULL,
  `supported_asset_id` varchar(36) NOT NULL,
  `crypto_symbol_snapshot` varchar(32) NOT NULL,
  `network_snapshot` varchar(64) NOT NULL,
  `tx_hash` varchar(128) NOT NULL,
  `event_index` int unsigned NOT NULL DEFAULT 0,
  `from_address` varchar(128) DEFAULT NULL,
  `to_address` varchar(128) NOT NULL,
  `amount_crypto` decimal(36,18) NOT NULL,
  `confirmations` int unsigned NOT NULL DEFAULT 0,
  `required_confirmations` int unsigned NOT NULL DEFAULT 1,
  `block_number` bigint unsigned DEFAULT NULL,
  `status` enum('DETECTED','CONFIRMING','CONFIRMED','FAILED','IGNORED') NOT NULL DEFAULT 'DETECTED',
  `raw_payload` json DEFAULT NULL,
  `detected_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`blockchain_transaction_id`),
  UNIQUE KEY `uq_blockchain_transactions_asset_tx_event` (`supported_asset_id`, `tx_hash`, `event_index`),
  KEY `idx_blockchain_transactions_payment` (`payment_id`),
  KEY `idx_blockchain_transactions_asset` (`supported_asset_id`),
  KEY `idx_blockchain_transactions_to_address` (`to_address`),
  KEY `idx_blockchain_transactions_status` (`status`),
  CONSTRAINT `fk_blockchain_transactions_payments` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`payment_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_blockchain_transactions_supported_assets` FOREIGN KEY (`supported_asset_id`) REFERENCES `supported_assets` (`supported_asset_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 7. Create settlements table ──
CREATE TABLE `settlements` (
  `settlement_id` varchar(36) NOT NULL,
  `payment_id` varchar(36) NOT NULL,
  `merchant_id` int NOT NULL,
  `payout_id` varchar(36) DEFAULT NULL,
  `gross_sgd_amount` decimal(12,2) NOT NULL,
  `provider_fee_sgd` decimal(12,2) NOT NULL DEFAULT '0.00',
  `platform_fee_sgd` decimal(12,2) NOT NULL DEFAULT '0.00',
  `net_settlement_sgd_amount` decimal(12,2) NOT NULL,
  `conversion_rate` decimal(36,18) DEFAULT NULL,
  `provider_name` varchar(100) NOT NULL DEFAULT 'MOCK_MAS_LICENSED_PROVIDER',
  `provider_reference` varchar(128) DEFAULT NULL,
  `status` enum('PENDING_CONVERSION','CONVERTED_TO_SGD','SETTLEMENT_PENDING','SETTLED','FAILED','MANUAL_REVIEW_REQUIRED') NOT NULL DEFAULT 'PENDING_CONVERSION',
  `converted_at` timestamp NULL DEFAULT NULL,
  `settled_at` timestamp NULL DEFAULT NULL,
  `failed_at` timestamp NULL DEFAULT NULL,
  `failure_reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`settlement_id`),
  UNIQUE KEY `uq_settlements_payment` (`payment_id`),
  KEY `idx_settlements_merchant_status` (`merchant_id`, `status`),
  KEY `idx_settlements_payout` (`payout_id`),
  CONSTRAINT `fk_settlements_payments` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`payment_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_settlements_merchants` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_settlements_merchant_payouts` FOREIGN KEY (`payout_id`) REFERENCES `merchant_payouts` (`payout_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 8. Create audit_logs table ──
CREATE TABLE `audit_logs` (
  `audit_log_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` int DEFAULT NULL,
  `payment_id` varchar(36) DEFAULT NULL,
  `blockchain_transaction_id` varchar(36) DEFAULT NULL,
  `settlement_id` varchar(36) DEFAULT NULL,
  `payout_id` varchar(36) DEFAULT NULL,
  `actor_type` enum('MERCHANT','CUSTOMER','SYSTEM','PROVIDER','ADMIN') NOT NULL,
  `actor_id` varchar(36) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `details` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_log_id`),
  KEY `idx_audit_logs_merchant_created` (`merchant_id`, `created_at`),
  KEY `idx_audit_logs_payment_created` (`payment_id`, `created_at`),
  KEY `idx_audit_logs_blockchain_transaction_created` (`blockchain_transaction_id`, `created_at`),
  KEY `idx_audit_logs_settlement_created` (`settlement_id`, `created_at`),
  KEY `idx_audit_logs_payout_created` (`payout_id`, `created_at`),
  KEY `idx_audit_logs_actor` (`actor_type`, `actor_id`),
  KEY `idx_audit_logs_action` (`action`),
  CONSTRAINT `fk_audit_logs_merchants` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_logs_payments` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`payment_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_logs_blockchain_transactions` FOREIGN KEY (`blockchain_transaction_id`) REFERENCES `blockchain_transactions` (`blockchain_transaction_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_logs_settlements` FOREIGN KEY (`settlement_id`) REFERENCES `settlements` (`settlement_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_logs_merchant_payouts` FOREIGN KEY (`payout_id`) REFERENCES `merchant_payouts` (`payout_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 9. Populate supported_assets ──
INSERT INTO `supported_assets` (
  `supported_asset_id`,
  `crypto_symbol`,
  `network`,
  `asset_type`,
  `display_name`,
  `token_symbol`,
  `contract_address`,
  `chain_id`,
  `decimals`,
  `min_confirmations`,
  `provider_module`
) VALUES
  ('asset-btc-testnet', 'BTC', 'BTC_TESTNET', 'NATIVE', 'Bitcoin Testnet', 'tBTC', NULL, NULL, 8, 2, 'btcTestnetProvider'),
  ('asset-eth-sepolia', 'ETH', 'ETH_SEPOLIA', 'NATIVE', 'Sepolia ETH', 'ETH', NULL, 11155111, 18, 1, 'ethSepoliaProvider'),
  ('asset-stablecoin-sepolia', 'TEST_STABLECOIN', 'STABLECOIN_SEPOLIA', 'ERC20', 'Sepolia Test Stablecoin', 'tUSDC', '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', 11155111, 6, 1, 'stablecoinSepoliaProvider');
