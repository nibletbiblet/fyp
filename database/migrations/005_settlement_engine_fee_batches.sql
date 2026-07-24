CREATE TABLE IF NOT EXISTS `merchant_fee_profiles` (
  `merchant_id` int NOT NULL,
  `platform_fee_rate` decimal(8,6) NOT NULL DEFAULT 0.015000,
  `maximum_total_rate` decimal(8,6) NOT NULL DEFAULT 0.030000,
  `settlement_delay_days` int NOT NULL DEFAULT 1,
  `settlement_currency` varchar(3) NOT NULL DEFAULT 'SGD',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`merchant_id`),
  CONSTRAINT `fk_merchant_fee_profiles_merchants`
    FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `merchant_fee_profiles` (`merchant_id`)
SELECT `id` FROM `merchants`;

ALTER TABLE `settlements`
  ADD COLUMN IF NOT EXISTS `conversion_cost_sgd` decimal(12,2) NOT NULL DEFAULT 0 AFTER `platform_fee_sgd`,
  ADD COLUMN IF NOT EXISTS `network_fee_sgd` decimal(12,2) NOT NULL DEFAULT 0 AFTER `conversion_cost_sgd`,
  ADD COLUMN IF NOT EXISTS `buffer_reserved_sgd` decimal(12,2) NOT NULL DEFAULT 0 AFTER `network_fee_sgd`,
  ADD COLUMN IF NOT EXISTS `buffer_released_sgd` decimal(12,2) NOT NULL DEFAULT 0 AFTER `buffer_reserved_sgd`;

CREATE TABLE IF NOT EXISTS `settlement_batches` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `settlement_date` date NOT NULL,
  `gross_amount_cents` bigint NOT NULL,
  `platform_fee_cents` bigint NOT NULL,
  `conversion_cost_cents` bigint NOT NULL DEFAULT 0,
  `network_fee_cents` bigint NOT NULL DEFAULT 0,
  `buffer_reserved_cents` bigint NOT NULL DEFAULT 0,
  `buffer_released_cents` bigint NOT NULL DEFAULT 0,
  `absorbed_by_chainforge_cents` bigint NOT NULL DEFAULT 0,
  `net_amount_cents` bigint NOT NULL,
  `stripe_transfer_id` varchar(255) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'PENDING',
  `failure_reason` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_settlement_batches_merchant_date` (`merchant_id`, `settlement_date`),
  KEY `idx_settlement_batches_status` (`status`),
  CONSTRAINT `fk_settlement_batches_merchants`
    FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
