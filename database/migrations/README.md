# Database Migrations

`database/schema.sql` is the clean baseline schema for fresh development databases.
It is the only authoritative SQL baseline.

Archived migrations in `database/migrations/archive/` were created against older schema drafts, backups, or intermediate rebuild candidates and should not be applied.

Do not apply these archived files:

- `001_onboarding_columns_superseded.sql` - onboarding columns and the verification-token index are already included in `database/schema.sql`.
- `001_payment_mvp_tables_old_patch.sql` - old incremental crypto payment patch based on the pre-rebuild transactions/ledger schema.
- `002_onboarding_schema_v2_incompatible.sql` - abandoned onboarding design using `merchant_users` and integer `merchants.id`.
- `rebuild_schema_v3_incompatible.sql` - abandoned destructive rebuild with `DROP TABLE`, `merchant_users`, and integer `merchants.id`.
- `schema_old_backup_obsolete.sql` - backup of the old schema with `transactions`, `ledger_entries`, and `payout_records`.
- `schema_rebuild_v1_superseded.sql` - intermediate rebuild candidate superseded by the approved `database/schema.sql`.

The incompatible onboarding files target an abandoned `merchant_users` / integer `merchants.id` design that conflicts with the approved UUID-based `merchants.merchant_id` schema.

Future database changes should be added as new migration files after this baseline. Name them in order, for example:

```text
002_add_example_table.sql
003_add_example_index.sql
```
