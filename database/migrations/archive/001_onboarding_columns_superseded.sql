-- ARCHIVED / SUPERSEDED: do not apply.
-- These onboarding columns and the verification-token index are already
-- included in the approved baseline database/schema.sql.

-- Migration: 001_onboarding_columns
-- Adds columns required for the merchant onboarding flow.
-- Run against an existing database that already has the merchants table.

ALTER TABLE `merchants`
  MODIFY COLUMN `status` enum('ACTIVE_UNVERIFIED','ACTIVE_ONBOARDED','SUSPENDED','CLOSED') NOT NULL DEFAULT 'ACTIVE_UNVERIFIED',
  ADD COLUMN `bank_account_encrypted` TEXT DEFAULT NULL AFTER `bank_holder_name`,
  ADD COLUMN `bank_account_iv` VARCHAR(32) DEFAULT NULL AFTER `bank_account_encrypted`,
  ADD COLUMN `bank_account_auth_tag` VARCHAR(32) DEFAULT NULL AFTER `bank_account_iv`,
  ADD COLUMN `email_verification_token` VARCHAR(128) DEFAULT NULL AFTER `bank_account_auth_tag`,
  ADD COLUMN `email_verified_at` TIMESTAMP NULL DEFAULT NULL AFTER `email_verification_token`,
  ADD COLUMN `container_id` VARCHAR(64) DEFAULT NULL AFTER `email_verified_at`,
  ADD COLUMN `wallet_id` VARCHAR(64) DEFAULT NULL AFTER `container_id`,
  ADD COLUMN `onboarded_at` TIMESTAMP NULL DEFAULT NULL AFTER `wallet_id`;

-- Index on verification token for fast lookups
ALTER TABLE `merchants`
  ADD KEY `idx_merchants_email_verification_token` (`email_verification_token`);
