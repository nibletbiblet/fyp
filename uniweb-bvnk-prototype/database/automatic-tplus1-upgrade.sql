USE uniweb_crytpo_payment;

SET @schema_name = DATABASE();

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE merchants ADD COLUMN bank_name VARCHAR(80) NULL AFTER bank_account_label',
    'SELECT ''bank_name already exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'merchants'
    AND COLUMN_NAME = 'bank_name'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE merchants ADD COLUMN account_holder_name VARCHAR(120) NULL AFTER bank_name',
    'SELECT ''account_holder_name already exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'merchants'
    AND COLUMN_NAME = 'account_holder_name'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE merchants ADD COLUMN account_last4 VARCHAR(4) NULL AFTER account_holder_name',
    'SELECT ''account_last4 already exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'merchants'
    AND COLUMN_NAME = 'account_last4'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE merchants
SET bank_name = COALESCE(bank_name, 'DBS'),
    account_holder_name = COALESCE(account_holder_name, CONCAT(name, ' Pte Ltd')),
    account_last4 = COALESCE(account_last4, '1234')
WHERE name = 'ABC Retail Store';

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE webhook_events ADD COLUMN event_id VARCHAR(120) NULL AFTER payment_id',
    'SELECT ''event_id already exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'webhook_events'
    AND COLUMN_NAME = 'event_id'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE webhook_events ADD UNIQUE KEY uq_webhook_events_event_id (event_id)',
    'SELECT ''uq_webhook_events_event_id already exists'''
  )
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'webhook_events'
    AND INDEX_NAME = 'uq_webhook_events_event_id'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE settlement_batches ADD COLUMN payout_status VARCHAR(40) NOT NULL DEFAULT ''SCHEDULED'' AFTER status',
    'SELECT ''payout_status already exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'settlement_batches'
    AND COLUMN_NAME = 'payout_status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE settlement_batches
SET payout_status = CASE
  WHEN status = 'SETTLED' THEN 'PAID_OUT'
  WHEN status = 'PROCESSING_BANK_TRANSFER' THEN 'PROCESSING_BANK_TRANSFER'
  ELSE 'SCHEDULED'
END;

UPDATE payments
SET settlement_status = 'SETTLEMENT_PENDING'
WHERE payment_status = 'PAID'
  AND settlement_status = 'NOT_SETTLED';
