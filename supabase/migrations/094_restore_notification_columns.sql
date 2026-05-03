-- 094: Restore notification columns lost to schema drift
--
-- Restores additive column work from migration 051 due to schema drift; 051 is
-- recorded as applied in supabase_migrations.schema_migrations but the columns
-- were absent on dg-command-center as of 2026-05-03. Drift window of silent
-- notification failures: ~2026-04-13 → 2026-05-03.
--
-- Cause unknown — see incident tracker. This migration is purely additive:
-- ADD COLUMN IF NOT EXISTS for every column 051 introduced, plus the four
-- supporting indexes. RLS policies and the realtime publication block from
-- 051 are NOT re-issued here (already in place; re-issuing is unnecessary
-- churn). Defaults are byte-identical to 051; existing rows backfill with
-- the same values they would have received the first time around.

-- ── notifications ────────────────────────────────────────────────────────────

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS actor_id            TEXT,
  ADD COLUMN IF NOT EXISTS event_type          TEXT,
  ADD COLUMN IF NOT EXISTS importance_tier     TEXT NOT NULL DEFAULT 'informational',
  ADD COLUMN IF NOT EXISTS entity_type         TEXT,
  ADD COLUMN IF NOT EXISTS entity_id           TEXT,
  ADD COLUMN IF NOT EXISTS parent_entity_type  TEXT,
  ADD COLUMN IF NOT EXISTS parent_entity_id    TEXT,
  ADD COLUMN IF NOT EXISTS seen_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_sent_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_queued_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS digest_eligible     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS digest_batch_id     UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_importance_tier_check'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_importance_tier_check
      CHECK (importance_tier IN ('critical', 'important', 'informational'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread_v2
  ON notifications (user_id) WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_digest
  ON notifications (user_id, digest_eligible)
  WHERE email_sent_at IS NULL AND digest_eligible = TRUE;

CREATE INDEX IF NOT EXISTS idx_notifications_event_type
  ON notifications (user_id, event_type);

CREATE INDEX IF NOT EXISTS idx_notifications_importance
  ON notifications (user_id, importance_tier)
  WHERE read_at IS NULL;

-- ── notification_preferences ────────────────────────────────────────────────

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS event_preferences JSONB NOT NULL DEFAULT '{
    "comment_mention":    { "in_app": true, "email": "instant" },
    "comment_reply":      { "in_app": true, "email": "instant" },
    "task_assigned":      { "in_app": true, "email": "instant" },
    "task_blocked":       { "in_app": true, "email": "instant" },
    "task_due_soon":      { "in_app": true, "email": "digest" },
    "task_status_change": { "in_app": true, "email": "digest" },
    "task_completed":     { "in_app": true, "email": "digest" },
    "subtask_completed":  { "in_app": true, "email": "off" }
  }',
  ADD COLUMN IF NOT EXISTS digest_frequency TEXT NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS digest_time      TIME NOT NULL DEFAULT '07:00';
