-- Replace old meetings module with new schema
-- Drops: meeting_minutes, meeting_action_items, meeting_recordings, draft_action_items
-- Creates: meetings, meeting_actions

-- ── Drop old tables (cascade drops dependent foreign keys) ────────────────────

DROP TABLE IF EXISTS draft_action_items CASCADE;
DROP TABLE IF EXISTS meeting_action_items CASCADE;
DROP TABLE IF EXISTS meeting_recordings CASCADE;
DROP TABLE IF EXISTS meeting_minutes CASCADE;

-- ── Create meeting status enum ────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE meeting_status AS ENUM (
    'UPLOADED',
    'TRANSCRIBING',
    'TRANSCRIBED',
    'ANALYZING',
    'ANALYZED',
    'ERROR'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── meetings ──────────────────────────────────────────────────────────────────

CREATE TABLE meetings (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title          TEXT NOT NULL,
  date           TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_secs  INTEGER,
  status         meeting_status NOT NULL DEFAULT 'UPLOADED',
  audio_path     TEXT,
  attendees      TEXT[] DEFAULT '{}',
  transcript_raw JSONB,
  transcript_text TEXT,
  summary        TEXT,
  decisions      TEXT[] DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_date ON meetings(date DESC);

-- ── meeting_actions ───────────────────────────────────────────────────────────

CREATE TABLE meeting_actions (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  task       TEXT NOT NULL,
  owner      TEXT,
  due_date   TIMESTAMPTZ,
  done       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meeting_actions_meeting ON meeting_actions(meeting_id);
CREATE INDEX idx_meeting_actions_done ON meeting_actions(done) WHERE NOT done;
