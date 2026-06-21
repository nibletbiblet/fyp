USE uniweb_crytpo_payment;

SET @schema_name = DATABASE();

CREATE TABLE IF NOT EXISTS merchants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  settlement_currency VARCHAR(10) NOT NULL DEFAULT 'SGD',
  bank_account_label VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_merchants_name (name)
);

CREATE TABLE IF NOT EXISTS merchant_users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  merchant_id INT UNSIGNED NOT NULL,
  email VARCHAR(160) NOT NULL,
  password_hash VARCHAR(160) NOT NULL,
  password_salt VARCHAR(64) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_merchant_users_email (email),
  KEY idx_merchant_users_merchant_id (merchant_id)
);

INSERT IGNORE INTO merchants (name, settlement_currency, bank_account_label)
VALUES ('ABC Retail Store', 'SGD', 'DBS Business Account ****1234');

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE payments ADD COLUMN merchant_id INT UNSIGNED NULL AFTER id',
    'SELECT ''merchant_id already exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'payments'
    AND COLUMN_NAME = 'merchant_id'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE payments ADD COLUMN processor_fee DECIMAL(12, 2) NOT NULL DEFAULT 0.00 AFTER status_reason',
    'SELECT ''processor_fee already exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'payments'
    AND COLUMN_NAME = 'processor_fee'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE payments ADD COLUMN network_fee DECIMAL(12, 2) NOT NULL DEFAULT 0.00 AFTER processor_fee',
    'SELECT ''network_fee already exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'payments'
    AND COLUMN_NAME = 'network_fee'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE payments ADD COLUMN net_settlement_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00 AFTER network_fee',
    'SELECT ''net_settlement_amount already exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'payments'
    AND COLUMN_NAME = 'net_settlement_amount'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE payments
INNER JOIN merchants ON merchants.name = COALESCE(payments.merchant_name, 'ABC Retail Store')
SET payments.merchant_id = merchants.id
WHERE payments.merchant_id IS NULL;

UPDATE payments
SET processor_fee = ROUND(fiat_amount * 0.015, 2),
    network_fee = 0.20,
    net_settlement_amount = GREATEST(ROUND(fiat_amount - ROUND(fiat_amount * 0.015, 2) - 0.20, 2), 0)
WHERE net_settlement_amount = 0.00;

CREATE TABLE IF NOT EXISTS blockchain_transactions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_id INT UNSIGNED NOT NULL,
  tx_hash VARCHAR(120) NOT NULL,
  network VARCHAR(30) NOT NULL,
  from_wallet VARCHAR(160) NOT NULL,
  to_wallet VARCHAR(160) NOT NULL,
  expected_amount DECIMAL(18, 8) NOT NULL,
  received_amount DECIMAL(18, 8) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  confirmations INT UNSIGNED NOT NULL DEFAULT 0,
  confirmed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_blockchain_transactions_tx_hash (tx_hash),
  KEY idx_blockchain_transactions_payment_id (payment_id)
);

CREATE TABLE IF NOT EXISTS settlement_batches (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  merchant_id INT UNSIGNED NOT NULL,
  batch_reference VARCHAR(80) NOT NULL,
  payment_count INT UNSIGNED NOT NULL,
  gross_amount DECIMAL(12, 2) NOT NULL,
  total_fees DECIMAL(12, 2) NOT NULL,
  net_amount DECIMAL(12, 2) NOT NULL,
  settlement_date DATE NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'SCHEDULED_T_PLUS_1',
  settled_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settlement_batches_reference (batch_reference),
  KEY idx_settlement_batches_merchant_id (merchant_id)
);

CREATE TABLE IF NOT EXISTS settlement_batch_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id INT UNSIGNED NOT NULL,
  payment_id INT UNSIGNED NOT NULL,
  gross_amount DECIMAL(12, 2) NOT NULL,
  processor_fee DECIMAL(12, 2) NOT NULL,
  network_fee DECIMAL(12, 2) NOT NULL,
  net_amount DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settlement_batch_items_payment (payment_id),
  KEY idx_settlement_batch_items_batch_id (batch_id)
);
