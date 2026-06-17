# Database Migrations

`database/schema.sql` is the clean baseline schema for fresh development databases.

Archived migrations in `database/migrations/archive/` were created against older schema drafts and should not be applied.

Future database changes should be added as new migration files after this baseline. Name them in order, for example:

```text
002_add_example_table.sql
003_add_example_index.sql
```
