-- Drop old notion-synced tasks cache
DROP TABLE IF EXISTS notion_tasks CASCADE;
DROP TABLE IF EXISTS notion_meetings CASCADE;

-- Drop existing tasks table if it exists (from prior migration attempt)
DROP TABLE IF EXISTS tasks CASCADE;

-- Native tasks — source of truth
CREATE TABLE tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'not_started'
                        CHECK (status IN ('not_started', 'in_progress', 'completed', 'blocked')),
  priority            TEXT DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date            DATE,
  agency              TEXT,
  role                TEXT,
  owner_user_id       UUID NOT NULL REFERENCES users(id),
  assigned_by_user_id UUID REFERENCES users(id),
  source_meeting_id   UUID,
  notion_id           TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_access ON tasks FOR ALL
  USING (
    owner_user_id = auth.uid()
    OR assigned_by_user_id = auth.uid()
    OR (SELECT role FROM users WHERE id = auth.uid()) IN ('dg', 'minister', 'ps')
  );

CREATE INDEX idx_tasks_owner ON tasks(owner_user_id);
CREATE INDEX idx_tasks_assigned_by ON tasks(assigned_by_user_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due ON tasks(due_date);
CREATE INDEX idx_tasks_agency ON tasks(agency);

-- Update meeting_action_items to reference tasks table
ALTER TABLE meeting_action_items
  DROP COLUMN IF EXISTS task_id,
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id);

-- User-scope the AI briefing cache
ALTER TABLE ai_metric_snapshot
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

ALTER TABLE ai_metric_snapshot
  DROP CONSTRAINT IF EXISTS ai_metric_snapshot_snapshot_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_snapshot_user_date
  ON ai_metric_snapshot(user_id, snapshot_date);

-- RLS on other tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_access ON documents FOR SELECT
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('dg', 'minister', 'ps')
    OR (SELECT agency FROM users WHERE id = auth.uid()) = documents.agency
    OR documents.agency IS NULL
  );

CREATE POLICY notifications_own ON notifications FOR ALL
  USING (user_id = auth.uid()::text);

CREATE POLICY tokens_own ON integration_tokens FOR ALL
  USING (user_id = (SELECT id::text FROM users WHERE id = auth.uid()));
