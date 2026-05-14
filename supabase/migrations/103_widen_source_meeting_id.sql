-- ============================================================================
-- Migration 103: Widen tasks.source_meeting_id from UUID to TEXT
-- Spec: docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md
-- Plan: docs/superpowers/plans/2026-05-03-action-items-plan-2-tasks-lifecycle.md
--
-- Background: migration 022 created source_meeting_id as UUID (legacy DGOS
-- meetings linkage). Migration 102 attempted ADD COLUMN IF NOT EXISTS ... TEXT
-- but the column already existed, so the type stayed UUID. Fireflies meeting
-- IDs are not UUIDs (e.g., '01HG5XYZ...'), so the action-items extraction
-- pipeline needs the column widened.
--
-- The cast UUID -> TEXT is lossless: PostgreSQL renders the canonical
-- 36-character UUID string. Existing equality comparisons keep working
-- because both sides are now TEXT.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks'
      AND column_name = 'source_meeting_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE tasks
      ALTER COLUMN source_meeting_id TYPE TEXT USING source_meeting_id::text;
  END IF;
END$$;

COMMENT ON COLUMN tasks.source_meeting_id IS
  'TEXT — carries DGOS meeting UUIDs (legacy) or Fireflies meeting IDs (extraction).';
