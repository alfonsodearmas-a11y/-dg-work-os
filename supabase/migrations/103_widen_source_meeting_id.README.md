# Migration 103 — Widen tasks.source_meeting_id

## Summary

Widens `tasks.source_meeting_id` from UUID to TEXT so Fireflies meeting IDs
(non-UUID strings) can land in the column.

## Why this is a separate migration from 102

Migration 102 had been executed in production before this requirement
surfaced. The forward-only project rule applies — never edit a migration
that has been applied. Migration 103 is the standard pattern.

## How to run

Manual via Supabase Dashboard → SQL Editor.

1. Open https://supabase.com/dashboard
2. SQL Editor → New query
3. Paste the contents of `103_widen_source_meeting_id.sql`
4. Run

## Idempotency

The DO block only runs the ALTER if the column is still UUID. Re-runs are safe.

## Verification

```sql
SELECT data_type FROM information_schema.columns
WHERE table_name='tasks' AND column_name='source_meeting_id';
-- expected: text
```
