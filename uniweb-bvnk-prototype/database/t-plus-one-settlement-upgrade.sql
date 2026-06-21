USE uniweb_crytpo_payment;

SET @schema_name = DATABASE();

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE settlement_batches ADD COLUMN settlement_date DATE NULL AFTER net_amount',
    'SELECT ''settlement_date already exists'''
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'settlement_batches'
    AND COLUMN_NAME = 'settlement_date'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE settlement_batches
SET settlement_date = DATE(COALESCE(settled_at, created_at))
WHERE settlement_date IS NULL;

UPDATE settlement_batches
SET status = 'SETTLED'
WHERE settled_at IS NOT NULL;

UPDATE payments
INNER JOIN settlement_batch_items ON settlement_batch_items.payment_id = payments.id
INNER JOIN settlement_batches ON settlement_batches.id = settlement_batch_items.batch_id
SET payments.settlement_status = 'SCHEDULED_T_PLUS_1'
WHERE settlement_batches.status = 'SCHEDULED_T_PLUS_1'
  AND payments.settlement_status = 'SETTLEMENT_PENDING';
