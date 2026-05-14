-- Migration 107: Backfill tasks.completed_at for grace-period filter
--
-- Phase 1 of the tasks UX overhaul (spec: docs/superpowers/specs/2026-05-06-tasks-ui-ux-overhaul.md)
-- introduces a grace-period filter on /api/tasks that hides done/superseded tasks
-- whose completed_at is older than TASKS_GRACE_PERIOD_DAYS (default 7). Existing
-- terminal-state rows have NULL completed_at and would silently pass through
-- (rendering as "recent" forever). Backfill them from updated_at, falling back
-- to created_at, so the filter has an anchor.
--
-- Forward-going writes:
--   - app/api/tasks/[id]/route.ts already sets completed_at on done-flip.
--   - app/api/action-items/[id]/supersedes/route.ts is updated in the same
--     PR to set completed_at on superseded transitions.

UPDATE tasks
SET completed_at = COALESCE(completed_at, updated_at, created_at)
WHERE status IN ('done', 'superseded')
  AND completed_at IS NULL;

-- Partial index keeps the grace-period filter fast. Postgres can use it for
-- queries like:
--   WHERE status IN ('done','superseded') AND completed_at >= NOW() - INTERVAL '7 days'
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at_status
  ON tasks (completed_at, status)
  WHERE status IN ('done', 'superseded');
