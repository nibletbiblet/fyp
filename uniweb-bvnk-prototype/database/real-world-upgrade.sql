USE uniweb_crytpo_payment;

SET @schema_name = DATABASE();

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE payments ADD COLUMN status_reason VARCHAR(255) NULL AFTER settlement_status',
    'SELECT ''status_reason already exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'payments'
    AND COLUMN_NAME = 'status_reason'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE payments ADD COLUMN expires_at DATETIME NULL AFTER status_reason',
    'SELECT ''expires_at already exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'payments'
    AND COLUMN_NAME = 'expires_at'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE payments ADD COLUMN paid_at DATETIME NULL AFTER expires_at',
    'SELECT ''paid_at already exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'payments'
    AND COLUMN_NAME = 'paid_at'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE payments ADD COLUMN settled_at DATETIME NULL AFTER paid_at',
    'SELECT ''settled_at already exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'payments'
    AND COLUMN_NAME = 'settled_at'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE payments ADD INDEX idx_payments_expires_at (expires_at)',
    'SELECT ''idx_payments_expires_at already exists'''
  )
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'payments'
    AND INDEX_NAME = 'idx_payments_expires_at'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE payments
SET expires_at = DATE_ADD(created_at, INTERVAL 15 MINUTE)
WHERE expires_at IS NULL
  AND payment_status = 'PENDING';

UPDATE payments
SET settlement_status = 'SETTLEMENT_PENDING'
WHERE payment_status = 'PAID'
  AND settlement_status = 'NOT_SETTLED';
