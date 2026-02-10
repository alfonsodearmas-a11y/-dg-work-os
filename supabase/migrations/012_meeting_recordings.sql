-- Meeting Recordings & Draft Action Items
-- Parallel pipeline to meeting_minutes: audio upload → Scriberr transcription → Claude analysis → review workflow → Notion push

-- ── meeting_recordings ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meeting_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  meeting_date TIMESTAMPTZ,
  attendees TEXT[] DEFAULT '{}',
  notes TEXT,

  -- Audio file (stored in Supabase Storage "recordings" bucket)
  audio_file_path TEXT,
  audio_filename TEXT,
  audio_mime_type TEXT,
  audio_file_size BIGINT,

  -- Scriberr integration
  scriberr_id TEXT,

  -- Transcript
  raw_transcript TEXT,
  speaker_labels JSONB DEFAULT '[]',

  -- AI analysis output
  analysis JSONB,
  ai_model TEXT,
  ai_tokens_used INTEGER,

  -- Status workflow: uploading → transcribing → transcribed → processing → completed → failed
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'transcribing', 'transcribed', 'processing', 'completed', 'failed')),
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meeting_recordings_status ON meeting_recordings(status);
CREATE INDEX idx_meeting_recordings_date ON meeting_recordings(meeting_date DESC);
CREATE INDEX idx_meeting_recordings_scriberr ON meeting_recordings(scriberr_id) WHERE scriberr_id IS NOT NULL;

-- ── draft_action_items ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS draft_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES meeting_recordings(id) ON DELETE CASCADE,
  item_index INTEGER NOT NULL DEFAULT 0,

  -- Item content
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT,
  deadline DATE,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  agency TEXT,

  -- Review workflow: pending → approved → pushed_to_notion OR rejected
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'pushed_to_notion')),
  reviewer_note TEXT,

  -- Notion integration
  notion_task_id TEXT,
  push_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_draft_action_items_recording ON draft_action_items(recording_id);
CREATE INDEX idx_draft_action_items_status ON draft_action_items(review_status);
