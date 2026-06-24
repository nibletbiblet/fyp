-- ARCHIVED / SUPERSEDED OLD PATCH: do not apply.
-- This incremental patch was based on the old transactions/ledger schema.
-- Its intended concepts are already represented in database/schema.sql.

-- Migration: 001_payment_mvp_tables
-- Purpose: Add the crypto payment MVP schema without overwriting database/schema.sql.
-- Notes:
-- - Reuses the existing merchants table.
-- - Leaves the existing transactions table intact because it is too narrow for
--   crypto selection, QR data, blockchain detection, confirmation tracking, and
--   conversion/settlement status.

ALTER TABLE `merchants`
  ADD COLUMN `bank_account_last4` varchar(4) DEFAULT NULL AFTER `bank_account_no`,
  ADD COLUMN `kyc_status` enum('PENDING','APPROVED','REJECTED','MANUAL_REVIEW') NOT NULL DEFAULT 'PENDING' AFTER `status`,
  ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`;

UPDATE `merchants`
SET `bank_account_last4` = RIGHT(`bank_account_no`, 4)
WHERE `bank_account_no` IS NOT NULL
  AND `bank_account_no` <> ''
  AND `bank_account_last4` IS NULL;

CREATE TABLE `payments` (
  `payment_id` varchar(36) NOT NULL,
  `merchant_id` varchar(36) NOT NULL,
  `payment_reference` varchar(64) NOT NULL,
  `amount_sgd` decimal(12,2) NOT NULL,
  `selected_crypto` enum('BTC','ETH','TEST_STABLECOIN') DEFAULT NULL,
  `selected_network` enum('BTC_TESTNET','ETH_SEPOLIA','STABLECOIN_SEPOLIA') DEFAULT NULL,
  `expected_crypto_amount` decimal(36,18) DEFAULT NULL,
  `received_crypto_amount` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000',
  `receiving_address` varchar(128) DEFAULT NULL,
  `qr_code_data` text,
  `provider_name` varchar(100) NOT NULL DEFAULT 'MOCK_MAS_LICENSED_PROVIDER',
  `provider_reference` varchar(128) DEFAULT NULL,
  `stablecoin_symbol` varchar(20) DEFAULT NULL,
  `stablecoin_contract_address` varchar(128) DEFAULT NULL,
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
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `uq_payments_payment_reference` (`payment_reference`),
  KEY `idx_payments_merchant_status` (`merchant_id`, `status`),
  KEY `idx_payments_selected_crypto_network` (`selected_crypto`, `selected_network`),
  KEY `idx_payments_receiving_address` (`receiving_address`),
  KEY `idx_payments_expires_at` (`expires_at`),
  CONSTRAINT `fk_payments_merchants` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`merchant_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_payments_amount_sgd_positive` CHECK (`amount_sgd` > 0),
  CONSTRAINT `chk_payments_expected_crypto_amount_positive` CHECK (`expected_crypto_amount` IS NULL OR `expected_crypto_amount` > 0),
  CONSTRAINT `chk_payments_received_crypto_amount_nonnegative` CHECK (`received_crypto_amount` >= 0),
  CONSTRAINT `chk_payments_crypto_network_pair` CHECK (
    (`selected_crypto` IS NULL AND `selected_network` IS NULL)
    OR (`selected_crypto` = 'BTC' AND `selected_network` = 'BTC_TESTNET')
    OR (`selected_crypto` = 'ETH' AND `selected_network` = 'ETH_SEPOLIA')
    OR (`selected_crypto` = 'TEST_STABLECOIN' AND `selected_network` = 'STABLECOIN_SEPOLIA')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `blockchain_transactions` (
  `blockchain_transaction_id` varchar(36) NOT NULL,
  `payment_id` varchar(36) NOT NULL,
  `selected_crypto` enum('BTC','ETH','TEST_STABLECOIN') NOT NULL,
  `selected_network` enum('BTC_TESTNET','ETH_SEPOLIA','STABLECOIN_SEPOLIA') NOT NULL,
  `tx_hash` varchar(128) NOT NULL,
  `from_address` varchar(128) DEFAULT NULL,
  `to_address` varchar(128) NOT NULL,
  `amount_crypto` decimal(36,18) NOT NULL,
  `confirmations` int unsigned NOT NULL DEFAULT 0,
  `block_number` bigint unsigned DEFAULT NULL,
  `raw_payload` json DEFAULT NULL,
  `detected_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`blockchain_transaction_id`),
  UNIQUE KEY `uq_blockchain_transactions_network_tx_hash` (`selected_network`, `tx_hash`),
  KEY `idx_blockchain_transactions_payment` (`payment_id`),
  KEY `idx_blockchain_transactions_to_address` (`to_address`),
  KEY `idx_blockchain_transactions_confirmations` (`confirmations`),
  CONSTRAINT `fk_blockchain_transactions_payments` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`payment_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_blockchain_transactions_amount_positive` CHECK (`amount_crypto` > 0),
  CONSTRAINT `chk_blockchain_transactions_crypto_network_pair` CHECK (
    (`selected_crypto` = 'BTC' AND `selected_network` = 'BTC_TESTNET')
    OR (`selected_crypto` = 'ETH' AND `selected_network` = 'ETH_SEPOLIA')
    OR (`selected_crypto` = 'TEST_STABLECOIN' AND `selected_network` = 'STABLECOIN_SEPOLIA')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `settlements` (
  `settlement_id` varchar(36) NOT NULL,
  `payment_id` varchar(36) NOT NULL,
  `merchant_id` varchar(36) NOT NULL,
  `gross_sgd_amount` decimal(12,2) NOT NULL,
  `provider_fee_sgd` decimal(12,2) NOT NULL DEFAULT '0.00',
  `platform_fee_sgd` decimal(12,2) NOT NULL DEFAULT '0.00',
  `payout_fee_sgd` decimal(12,2) NOT NULL DEFAULT '0.00',
  `net_sgd_amount` decimal(12,2) NOT NULL,
  `conversion_rate` decimal(36,18) DEFAULT NULL,
  `provider_name` varchar(100) NOT NULL DEFAULT 'MOCK_MAS_LICENSED_PROVIDER',
  `provider_reference` varchar(128) DEFAULT NULL,
  `status` enum('PENDING_CONVERSION','CONVERTED_TO_SGD','SETTLED','FAILED','MANUAL_REVIEW_REQUIRED') NOT NULL DEFAULT 'PENDING_CONVERSION',
  `payout_status` enum('NOT_READY','PENDING_APPROVAL','PROCESSING','PAID_OUT','FAILED') NOT NULL DEFAULT 'NOT_READY',
  `payout_reference` varchar(128) DEFAULT NULL,
  `converted_at` timestamp NULL DEFAULT NULL,
  `settled_at` timestamp NULL DEFAULT NULL,
  `paid_out_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`settlement_id`),
  UNIQUE KEY `uq_settlements_payment` (`payment_id`),
  KEY `idx_settlements_merchant_status` (`merchant_id`, `status`),
  KEY `idx_settlements_payout_status` (`payout_status`),
  CONSTRAINT `fk_settlements_payments` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`payment_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_settlements_merchants` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`merchant_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_settlements_gross_sgd_amount_nonnegative` CHECK (`gross_sgd_amount` >= 0),
  CONSTRAINT `chk_settlements_provider_fee_nonnegative` CHECK (`provider_fee_sgd` >= 0),
  CONSTRAINT `chk_settlements_platform_fee_nonnegative` CHECK (`platform_fee_sgd` >= 0),
  CONSTRAINT `chk_settlements_payout_fee_nonnegative` CHECK (`payout_fee_sgd` >= 0),
  CONSTRAINT `chk_settlements_net_sgd_amount_nonnegative` CHECK (`net_sgd_amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `audit_logs` (
  `audit_log_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` varchar(36) DEFAULT NULL,
  `payment_id` varchar(36) DEFAULT NULL,
  `actor_type` enum('MERCHANT','CUSTOMER','SYSTEM','PROVIDER','ADMIN') NOT NULL,
  `actor_id` varchar(36) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `details` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_log_id`),
  KEY `idx_audit_logs_merchant_created` (`merchant_id`, `created_at`),
  KEY `idx_audit_logs_payment_created` (`payment_id`, `created_at`),
  KEY `idx_audit_logs_actor` (`actor_type`, `actor_id`),
  KEY `idx_audit_logs_action` (`action`),
  CONSTRAINT `fk_audit_logs_merchants` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`merchant_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_logs_payments` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`payment_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
