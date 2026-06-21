CREATE DATABASE IF NOT EXISTS uniweb_crytpo_payment;

USE uniweb_crytpo_payment;

CREATE TABLE IF NOT EXISTS merchants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  settlement_currency VARCHAR(10) NOT NULL DEFAULT 'SGD',
  bank_account_label VARCHAR(120) NULL,
  bank_name VARCHAR(80) NULL,
  account_holder_name VARCHAR(120) NULL,
  account_last4 VARCHAR(4) NULL,
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
  KEY idx_merchant_users_merchant_id (merchant_id),
  CONSTRAINT fk_merchant_users_merchant
    FOREIGN KEY (merchant_id)
    REFERENCES merchants (id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  merchant_id INT UNSIGNED NOT NULL,
  merchant_name VARCHAR(120) NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  fiat_amount DECIMAL(12, 2) NOT NULL,
  fiat_currency VARCHAR(10) NOT NULL DEFAULT 'SGD',
  crypto_currency VARCHAR(10) NOT NULL,
  network VARCHAR(30) NOT NULL,
  exchange_rate DECIMAL(18, 8) NOT NULL,
  crypto_amount DECIMAL(18, 8) NOT NULL,
  wallet_address VARCHAR(160) NOT NULL,
  reference VARCHAR(80) NOT NULL,
  payment_status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  settlement_status VARCHAR(60) NOT NULL DEFAULT 'NOT_SETTLED',
  status_reason VARCHAR(255) NULL,
  processor_fee DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  network_fee DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  net_settlement_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  expires_at DATETIME NULL,
  paid_at DATETIME NULL,
  settled_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_reference (reference),
  KEY idx_payments_merchant_id (merchant_id),
  KEY idx_payments_payment_status (payment_status),
  KEY idx_payments_settlement_status (settlement_status),
  KEY idx_payments_expires_at (expires_at),
  KEY idx_payments_created_at (created_at),
  CONSTRAINT fk_payments_merchant
    FOREIGN KEY (merchant_id)
    REFERENCES merchants (id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_id INT UNSIGNED NOT NULL,
  event_id VARCHAR(120) NULL,
  event_type VARCHAR(80) NOT NULL,
  payload JSON NOT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_webhook_events_event_id (event_id),
  KEY idx_webhook_events_payment_id (payment_id),
  KEY idx_webhook_events_event_type (event_type),
  CONSTRAINT fk_webhook_events_payment
    FOREIGN KEY (payment_id)
    REFERENCES payments (id)
    ON DELETE CASCADE
);

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
  KEY idx_blockchain_transactions_payment_id (payment_id),
  CONSTRAINT fk_blockchain_transactions_payment
    FOREIGN KEY (payment_id)
    REFERENCES payments (id)
    ON DELETE CASCADE
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
  payout_status VARCHAR(40) NOT NULL DEFAULT 'SCHEDULED',
  settled_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settlement_batches_reference (batch_reference),
  KEY idx_settlement_batches_merchant_id (merchant_id),
  CONSTRAINT fk_settlement_batches_merchant
    FOREIGN KEY (merchant_id)
    REFERENCES merchants (id)
    ON DELETE RESTRICT
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
  KEY idx_settlement_batch_items_batch_id (batch_id),
  CONSTRAINT fk_settlement_batch_items_batch
    FOREIGN KEY (batch_id)
    REFERENCES settlement_batches (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_settlement_batch_items_payment
    FOREIGN KEY (payment_id)
    REFERENCES payments (id)
    ON DELETE CASCADE
);

INSERT IGNORE INTO merchants (
  name,
  settlement_currency,
  bank_account_label,
  bank_name,
  account_holder_name,
  account_last4
)
VALUES (
  'ABC Retail Store',
  'SGD',
  'DBS Business Account ****1234',
  'DBS',
  'ABC Retail Store Pte Ltd',
  '1234'
);

INSERT INTO payments (
  merchant_id,
  merchant_name,
  customer_name,
  fiat_amount,
  fiat_currency,
  crypto_currency,
  network,
  exchange_rate,
  crypto_amount,
  wallet_address,
  reference,
  payment_status,
  settlement_status,
  processor_fee,
  network_fee,
  net_settlement_amount,
  expires_at
)
SELECT
  merchants.id,
  'ABC Retail Store',
  'Walk-in Customer',
  50.00,
  'SGD',
  'USDT',
  'TRON',
  1.34000000,
  37.31000000,
  'TMockBVNKWalletAddress123456',
  'UNIWEB-1001',
  'PENDING',
  'NOT_SETTLED',
  0.75,
  0.20,
  49.05,
  DATE_ADD(NOW(), INTERVAL 15 MINUTE)
FROM merchants
WHERE merchants.name = 'ABC Retail Store'
  AND NOT EXISTS (
    SELECT 1 FROM payments WHERE reference = 'UNIWEB-1001'
  );
