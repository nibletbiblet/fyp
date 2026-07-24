-- Adds the staged settlement/payout lifecycle used by the current MVP code.
-- Use this only if your database was created from an older schema.sql.

SET @paid_out_at_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'settlements'
    AND column_name = 'paid_out_at'
);

SET @add_paid_out_at_sql = IF(
  @paid_out_at_exists = 0,
  'ALTER TABLE settlements ADD COLUMN paid_out_at TIMESTAMP NULL DEFAULT NULL AFTER settled_at',
  'SELECT 1'
);

PREPARE add_paid_out_at_stmt FROM @add_paid_out_at_sql;
EXECUTE add_paid_out_at_stmt;
DEALLOCATE PREPARE add_paid_out_at_stmt;

-- Needed only for databases where these status columns are ENUMs.
-- The runtime schema bootstrap uses VARCHAR status columns, so those databases
-- do not need the MODIFY COLUMN statements below.
ALTER TABLE settlements
  MODIFY COLUMN status ENUM(
    'PENDING_CONVERSION',
    'CONVERTED_TO_SGD',
    'SETTLEMENT_PENDING',
    'ELIGIBLE',
    'PROCESSING',
    'TRANSFERRED',
    'HELD',
    'SETTLED',
    'PAID_OUT',
    'FAILED',
    'MANUAL_REVIEW_REQUIRED'
  ) NOT NULL DEFAULT 'PENDING_CONVERSION';

ALTER TABLE payments
  MODIFY COLUMN status ENUM(
    'CREATED',
    'AWAITING_CRYPTO_SELECTION',
    'QR_GENERATED',
    'AWAITING_PAYMENT',
    'PAYMENT_DETECTED',
    'CONFIRMING',
    'CONFIRMED',
    'CONVERTED_TO_SGD',
    'SETTLED',
    'PAID_OUT',
    'KYC_REQUIRED',
    'INSUFFICIENT_FUNDS',
    'UNDERPAID',
    'WRONG_NETWORK',
    'EXPIRED',
    'FAILED',
    'MANUAL_REVIEW_REQUIRED'
  ) NOT NULL DEFAULT 'CREATED';
