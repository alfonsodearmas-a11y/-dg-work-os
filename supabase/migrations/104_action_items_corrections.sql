-- ============================================================================
-- Migration 104: Action Items pipeline corrections (rev 2026-05-04)
-- Spec: docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md
-- Plan: docs/superpowers/plans/2026-05-03-action-items-plan-3-fireflies-ingestion.md
--
-- 1. Drop meeting-level agency columns. Agency is per-action-item via the
--    owner's home agency; multi-agency meetings (mgmt calls, joint sessions)
--    can't be summarized by a single agency_name.
-- 2. Replace the advisory-lock approach for the Fireflies poller with a
--    single-row polling_state table. No RPC exposure, no fallback path.
--
-- Pre-flight: confirm meetings_seen and action_item_extractions are both
-- empty before running:
--   SELECT count(*) FROM meetings_seen;            -- expected: 0
--   SELECT count(*) FROM action_item_extractions;  -- expected: 0
-- If non-zero, stop and migrate data first.
-- ============================================================================

-- 1a) Drop detected_agency_name from meetings_seen (no constraint to drop).
ALTER TABLE meetings_seen DROP COLUMN IF EXISTS detected_agency_name;

-- 1b) Drop agency_name from action_item_extractions. The CHECK was unnamed
--     (inline anonymous), so drop it as part of the column drop.
ALTER TABLE action_item_extractions DROP COLUMN IF EXISTS agency_name;

-- 2) polling_state — single-row mutex for the Fireflies poller.
CREATE TABLE IF NOT EXISTS polling_state (
  id                      UUID PRIMARY KEY,
  locked_at               TIMESTAMPTZ,
  locked_by               TEXT,
  last_poll_completed_at  TIMESTAMPTZ
);

INSERT INTO polling_state (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE polling_state IS
  'Single-row mutex for cron pollers. action_items_poller uses id=...0001.
   Acquire: conditional UPDATE where (locked_at IS NULL OR locked_at < now()-5min).
   Release: UPDATE locked_at=NULL, last_poll_completed_at=now().';
