# Migration 102 — Action Items v1

## How to run

This migration is **not** auto-executed. Run it manually via Supabase Dashboard
(SQL Editor) against the project database.

1. Open the project at https://supabase.com/dashboard
2. SQL Editor → New query
3. Paste the contents of `102_action_items_v1.sql`
4. Run

## Pre-flight

The migration begins with `CREATE EXTENSION IF NOT EXISTS vector`. If the
Supabase project does not have pgvector enabled, this line will fail. Enable
the extension via Database → Extensions → search "vector" → Enable, then
re-run the migration.

## Idempotency

All `CREATE TABLE` and `CREATE INDEX` statements use `IF NOT EXISTS`. The
`ALTER TABLE users ADD COLUMN` statements use `IF NOT EXISTS`. Re-running the
migration is safe.

## Verification

After running, confirm:

```sql
SELECT count(*) FROM information_schema.tables
WHERE table_name IN
  ('action_items','action_item_extractions','action_item_events',
   'meetings_seen','failed_extractions');
-- expected: 5

SELECT column_name FROM information_schema.columns
WHERE table_name='users'
  AND column_name IN ('aliases','closure_mode','is_agency_head');
-- expected: 3 rows
```
