# Migration 105 — `uniq_tasks_extraction_item`

Applied directly to production via Supabase tools on 2026-05-05 after a smoke
on extraction `99049fe3` surfaced a duplicate-insert bug: the review submit
endpoint re-inserted accepted tasks on retry rather than skipping items
that had already landed. Four duplicate copies were created from a single
extraction across multiple submit attempts and had to be deleted by hand.

The migration adds a partial unique index on
`tasks(extraction_id, extraction_item_idx) WHERE extraction_id IS NOT NULL`,
which makes the `(extraction, item_index)` pair idempotent at the database
layer. The submit endpoint at
`app/api/action-items/review/[extractionId]/route.ts` was patched in the
same commit to use `upsert(..., { onConflict: 'extraction_id,extraction_item_idx', ignoreDuplicates: true })`
so retries after partial failures are safe.

This file is committed for git-history alignment with production schema
state. Re-running this migration in another environment is idempotent
(`CREATE UNIQUE INDEX IF NOT EXISTS`).
