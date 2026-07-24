ALTER TABLE `merchants`
  ADD COLUMN IF NOT EXISTS `stripe_onboarding_status` varchar(40) NOT NULL DEFAULT 'NOT_STARTED' AFTER `stripe_connected_account_id`,
  ADD COLUMN IF NOT EXISTS `stripe_details_submitted` tinyint(1) NOT NULL DEFAULT 0 AFTER `stripe_onboarding_status`,
  ADD COLUMN IF NOT EXISTS `stripe_payouts_enabled` tinyint(1) NOT NULL DEFAULT 0 AFTER `stripe_details_submitted`,
  ADD COLUMN IF NOT EXISTS `stripe_charges_enabled` tinyint(1) NOT NULL DEFAULT 0 AFTER `stripe_payouts_enabled`,
  ADD COLUMN IF NOT EXISTS `stripe_requirements_currently_due` json DEFAULT NULL AFTER `stripe_charges_enabled`,
  ADD COLUMN IF NOT EXISTS `stripe_requirements_disabled_reason` varchar(255) DEFAULT NULL AFTER `stripe_requirements_currently_due`,
  ADD COLUMN IF NOT EXISTS `stripe_status_synced_at` timestamp NULL DEFAULT NULL AFTER `stripe_requirements_disabled_reason`;

ALTER TABLE `settlements`
  MODIFY COLUMN `status` varchar(40) NOT NULL DEFAULT 'PENDING_CONVERSION';

ALTER TABLE `merchant_payouts`
  MODIFY COLUMN `status` varchar(40) NOT NULL DEFAULT 'NOT_READY';
