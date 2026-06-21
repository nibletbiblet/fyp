-- Migration: 002_onboarding_schema_v2
-- Creates the merchant_users table and adjusts the merchants table
-- to match the prototype onboarding schema.
--
-- Run this AFTER the base schema has been applied.

-- ── 1. Adjust merchants table ──
-- Drop columns that don't exist in the new design
ALTER TABLE `merchants`
  DROP COLUMN IF EXISTS `bank_account_encrypted`,
  DROP COLUMN IF EXISTS `bank_account_iv`,
  DROP COLUMN IF EXISTS `bank_account_auth_tag`,
  DROP COLUMN IF EXISTS `email_verification_token`,
  DROP COLUMN IF EXISTS `email_verified_at`,
  DROP COLUMN IF EXISTS `container_id`,
  DROP COLUMN IF EXISTS `wallet_id`,
  DROP COLUMN IF EXISTS `onboarded_at`,
  DROP COLUMN IF EXISTS `kyc_status`,
  DROP COLUMN IF EXISTS `uen`,
  DROP COLUMN IF EXISTS `password_hash`,
  DROP COLUMN IF EXISTS `bank_holder_name`;

-- Rename/adjust to match new column names if needed
-- The target schema columns:
--   id (PK, auto-increment integer)
--   name (varchar)
--   email (varchar)
--   bank_name (varchar)
--   account_holder_name (varchar)
--   account_last4 (varchar)
--   bank_account_label (varchar) — stores the business UEN
--   status (varchar, default 'ACTIVE_UNVERIFIED')
--   triplea_merchant_id (varchar, nullable)
--   triplea_wallet_id (varchar, nullable)

-- ── 2. Create merchant_users table ──
CREATE TABLE IF NOT EXISTS `merchant_users` (
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
