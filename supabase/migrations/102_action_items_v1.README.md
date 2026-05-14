# Migration 102 — Action Items v1 (rev 2026-05-03b)

## Summary

- Widens `users` (3 columns).
- Widens `tasks` (provenance, verification flow, supersession, visibility, status enum).
- Adds 4 pipeline-side tables: `action_item_extractions`, `action_item_events`, `meetings_seen`, `failed_extractions`.
- Disables the existing `tasks` RLS policy from migration 022 (visibility moves to app-layer for this module's flows).
- Enables pgvector.

**Note on `tasks.source_meeting_id`.** Migration 102's
`ADD COLUMN IF NOT EXISTS source_meeting_id TEXT` is a no-op because the column
already exists from migration 022 as UUID. The production-safe widen lives in
migration 103 (forward-only, runs after 102). Run 103 before any extraction
writes Fireflies meeting IDs to this column.

There is **no** `action_items` table — the spec was corrected before any
database execution. The canonical commitment layer is the existing `tasks`
table widened in this migration.

## How to run

This migration is **not** auto-executed. Run via Supabase Dashboard → SQL
Editor against the project database.

1. Open https://supabase.com/dashboard
2. SQL Editor → New query
3. Paste the contents of `102_action_items_v1.sql`
4. Run

## Pre-flight

- pgvector: `CREATE EXTENSION IF NOT EXISTS vector` runs at the top. If not
  available, enable via Database → Extensions → search "vector" → Enable.
- The `tasks` RLS policy (`tasks_access`) is dropped by this migration.
  After execution, all reads / writes on `tasks` will be unrestricted at
  the database layer; app-layer guards in `lib/action-items/visibility.ts`
  and the existing `app/api/tasks/*` route handlers carry enforcement.

## Idempotency

`IF NOT EXISTS` on every `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
and `CREATE INDEX IF NOT EXISTS`. The status-check rebuild uses
`DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT`. Safe to re-run.

## Verification

```sql
-- 4 pipeline tables
SELECT count(*) FROM information_schema.tables
WHERE table_name IN
  ('action_item_extractions','action_item_events','meetings_seen','failed_extractions');
-- expected: 4

-- users widened
SELECT column_name FROM information_schema.columns
WHERE table_name='users' AND column_name IN
  ('aliases','closure_mode','is_agency_head');
-- expected: 3 rows

-- tasks widened (sample of new columns)
SELECT column_name FROM information_schema.columns
WHERE table_name='tasks' AND column_name IN
  ('source','extraction_id','source_quote','completion_note','verified_by',
   'dispute_note','supersedes_id','visibility_scope','delegated_to_id',
   'task_embedding','confidence_overall');
-- expected: 11 rows

-- status enum widened
SELECT pg_get_constraintdef(oid)
FROM pg_constraint WHERE conname='tasks_status_check';
-- expected to include awaiting_verification and superseded

-- RLS disabled on tasks
SELECT relrowsecurity FROM pg_class WHERE relname='tasks';
-- expected: false
```
