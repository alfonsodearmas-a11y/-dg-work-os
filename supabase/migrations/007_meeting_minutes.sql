-- Meeting minutes table for AI-processed meeting transcripts
CREATE TABLE meeting_minutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_meeting_id VARCHAR(100) UNIQUE NOT NULL,
  title TEXT NOT NULL,
  meeting_date TIMESTAMP,
  attendees TEXT[],
  category TEXT,

  -- Transcript
  raw_transcript TEXT,
  transcript_block_count INTEGER DEFAULT 0,

  -- AI-generated output
  minutes_markdown TEXT,
  action_items JSONB DEFAULT '[]'::jsonb,
  ai_model TEXT,
  ai_tokens_used INTEGER,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','skipped','edited')),
  error_message TEXT,
  processed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_meeting_minutes_notion_id ON meeting_minutes(notion_meeting_id);
CREATE INDEX idx_meeting_minutes_status ON meeting_minutes(status);
CREATE INDEX idx_meeting_minutes_date ON meeting_minutes(meeting_date DESC);
