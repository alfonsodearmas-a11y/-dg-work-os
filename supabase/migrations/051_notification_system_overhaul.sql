-- 051: Notification system overhaul
-- Adds granular event types, importance tiers, entity tracking, email/digest
-- support, and RLS policies to the existing notifications & notification_preferences tables.
-- Idempotent: uses IF NOT EXISTS / DROP ... IF EXISTS throughout.

-- ============================================================================
-- 1. New columns on `notifications`
-- ============================================================================

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

-- Add a CHECK constraint on importance_tier (idempotent via DO block)
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

-- ============================================================================
-- 2. Indexes
-- ============================================================================

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

-- ============================================================================
-- 3. New columns on `notification_preferences`
-- ============================================================================

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
  ADD COLUMN IF NOT EXISTS digest_time TIME NOT NULL DEFAULT '07:00';

-- ============================================================================
-- 4. Row Level Security
-- ============================================================================

-- Enable RLS on both tables (safe to run even if already enabled)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- ---- notifications policies ------------------------------------------------

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (
    user_id = coalesce(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
  );

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (
    user_id = coalesce(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
  )
  WITH CHECK (
    user_id = coalesce(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
  );

-- Service role / server-side insert — any authenticated service can create notifications
DROP POLICY IF EXISTS "Service can insert notifications" ON notifications;
CREATE POLICY "Service can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Service role bypass (supabaseAdmin uses service_role key which bypasses RLS anyway,
-- but this documents intent and covers edge cases)
DROP POLICY IF EXISTS "Service role full access notifications" ON notifications;
CREATE POLICY "Service role full access notifications"
  ON notifications FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---- notification_preferences policies -------------------------------------

DROP POLICY IF EXISTS "Users can view own preferences" ON notification_preferences;
CREATE POLICY "Users can view own preferences"
  ON notification_preferences FOR SELECT
  USING (
    user_id = coalesce(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
  );

DROP POLICY IF EXISTS "Users can insert own preferences" ON notification_preferences;
CREATE POLICY "Users can insert own preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK (
    user_id = coalesce(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
  );

DROP POLICY IF EXISTS "Users can update own preferences" ON notification_preferences;
CREATE POLICY "Users can update own preferences"
  ON notification_preferences FOR UPDATE
  USING (
    user_id = coalesce(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
  )
  WITH CHECK (
    user_id = coalesce(auth.uid()::text, current_setting('request.jwt.claims', true)::json->>'sub')
  );

DROP POLICY IF EXISTS "Service role full access preferences" ON notification_preferences;
CREATE POLICY "Service role full access preferences"
  ON notification_preferences FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- 5. Ensure Realtime is enabled for notifications
-- ============================================================================
-- The publication was added in 009. Re-adding is a no-op if it already exists,
-- but ALTER PUBLICATION ... ADD TABLE will error if the table is already a member.
-- Use a DO block to guard.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;
