-- Recording Pipeline V2: Enhanced live recording UX
-- - No audio storage (audio is transient, piped to Scriberr then discarded)
-- - Add duration, recorded_at, agency to recordings
-- - Add context (transcript excerpt) to action items
-- - Add 'recording' status for active live recordings

-- ── meeting_recordings: add new columns ─────────────────────────────────────

ALTER TABLE meeting_recordings ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE meeting_recordings ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;
ALTER TABLE meeting_recordings ADD COLUMN IF NOT EXISTS agency TEXT;

-- ── meeting_recordings: drop audio file columns (audio is transient now) ────

ALTER TABLE meeting_recordings DROP COLUMN IF EXISTS audio_file_path;
ALTER TABLE meeting_recordings DROP COLUMN IF EXISTS audio_filename;
ALTER TABLE meeting_recordings DROP COLUMN IF EXISTS audio_mime_type;
ALTER TABLE meeting_recordings DROP COLUMN IF EXISTS audio_file_size;

-- ── meeting_recordings: update status CHECK to include 'recording' ──────────

ALTER TABLE meeting_recordings DROP CONSTRAINT IF EXISTS meeting_recordings_status_check;
ALTER TABLE meeting_recordings ADD CONSTRAINT meeting_recordings_status_check
  CHECK (status IN ('recording', 'uploading', 'transcribing', 'transcribed', 'processing', 'completed', 'failed'));

-- ── meeting_recordings: index on agency ─────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_meeting_recordings_agency ON meeting_recordings(agency) WHERE agency IS NOT NULL;

-- ── draft_action_items: add context column ──────────────────────────────────

ALTER TABLE draft_action_items ADD COLUMN IF NOT EXISTS context TEXT;
