# Migration 104 — Action Items pipeline corrections (rev 2026-05-04)

## Summary

- Drops `meetings_seen.detected_agency_name`. Agency is per-task via
  `tasks.owner_user_id → users.agency`, not per-meeting.
- Drops `action_item_extractions.agency_name` (and its CHECK constraint).
- Adds `polling_state` table — single-row mutex for the Fireflies poller.

## Pre-flight

Both dropped columns must be empty:

```sql
SELECT count(*) FROM meetings_seen;            -- expected: 0
SELECT count(*) FROM action_item_extractions;  -- expected: 0
```

If non-zero, do not run this migration without a data-migration step first.

## How to run

Same model as 102: paste the SQL into Supabase Dashboard → SQL Editor.
Idempotent (`IF EXISTS` / `IF NOT EXISTS` / `ON CONFLICT`).

## Verification

```sql
-- Columns dropped
SELECT column_name FROM information_schema.columns
WHERE table_name='meetings_seen' AND column_name='detected_agency_name';
-- expected: 0 rows
SELECT column_name FROM information_schema.columns
WHERE table_name='action_item_extractions' AND column_name='agency_name';
-- expected: 0 rows

-- polling_state seeded
SELECT id FROM polling_state WHERE id='00000000-0000-0000-0000-000000000001';
-- expected: 1 row, locked_at=NULL
```
