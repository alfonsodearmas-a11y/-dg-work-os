-- Junction table linking meeting action items to created Notion tasks
CREATE TABLE meeting_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meeting_minutes(id) ON DELETE CASCADE,
  task_id TEXT,                    -- Notion page ID of the created task
  action_item_id TEXT NOT NULL,    -- e.g. "AI-001" matching the JSON
  title TEXT NOT NULL,
  assigned_to TEXT,
  status VARCHAR(20) DEFAULT 'created'
    CHECK (status IN ('created', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mai_meeting_id ON meeting_action_items(meeting_id);
CREATE INDEX idx_mai_task_id ON meeting_action_items(task_id);
CREATE UNIQUE INDEX idx_mai_meeting_action ON meeting_action_items(meeting_id, action_item_id);
