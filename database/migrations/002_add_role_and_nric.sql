-- Migration: 002_add_role_and_nric
-- Adds role-based access control to merchant_users (CEO, CFO, TECH_LEAD)
-- and NRIC last-4 field to kyc_submissions for representative identity verification.

-- 1. Add role column to merchant_users
ALTER TABLE `merchant_users`
  ADD COLUMN `role` ENUM('CEO','CFO','TECH_LEAD') NOT NULL DEFAULT 'CEO' AFTER `full_name`;

-- 2. Enforce one user per role per merchant (e.g., only one CEO per business)
ALTER TABLE `merchant_users`
  ADD UNIQUE KEY `uq_merchant_users_merchant_role` (`merchant_id`, `role`);

-- 3. Add NRIC last-4 field for authorized representative identity verification
ALTER TABLE `kyc_submissions`
  ADD COLUMN `rep_nric_last4` VARCHAR(4) DEFAULT NULL AFTER `rep_contact_number`;
