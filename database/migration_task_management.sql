-- ============================================
-- TASK MANAGEMENT SYSTEM MIGRATION
-- Multi-user task assignment, tracking & notifications
-- ============================================

-- ── 1. Extend users table ──────────────────────────────────────────────────

-- Add new columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notion_user_id VARCHAR(100);

-- Widen role CHECK to include 'ceo'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('data_entry', 'supervisor', 'director', 'admin', 'ceo'));

-- Widen agency CHECK to include new agencies
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_agency_check;
ALTER TABLE users ADD CONSTRAINT users_agency_check
  CHECK (agency IN ('cjia', 'gwi', 'gpl', 'gcaa', 'ministry', 'marad', 'heci', 'ppdi', 'has'));

-- ── 2. Tasks table ─────────────────────────────────────────────────────────

CREATE TYPE task_status AS ENUM (
  'assigned', 'acknowledged', 'in_progress', 'submitted', 'verified', 'rejected', 'overdue'
);

CREATE TYPE task_priority AS ENUM ('critical', 'high', 'medium', 'low');

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'assigned',
  priority task_priority NOT NULL DEFAULT 'medium',
  agency VARCHAR(20) NOT NULL,
  assignee_id UUID NOT NULL REFERENCES users(id),
  created_by UUID NOT NULL REFERENCES users(id),
  due_date DATE,
  tags TEXT[] DEFAULT '{}',
  evidence TEXT[] DEFAULT '{}',
  completion_notes TEXT,

  -- Notion sync
  notion_page_id VARCHAR(100),
  last_notion_sync_at TIMESTAMP WITH TIME ZONE,

  -- Source links (meeting pipeline integration)
  source_meeting_id VARCHAR(100),
  source_recording_id UUID,

  -- Lifecycle timestamps
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  submitted_at TIMESTAMP WITH TIME ZONE,
  verified_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── 3. Task activities (append-only audit trail) ───────────────────────────

CREATE TYPE task_action AS ENUM (
  'created', 'status_changed', 'priority_changed', 'reassigned',
  'commented', 'due_date_changed', 'extension_requested',
  'extension_approved', 'extension_rejected', 'evidence_added',
  'notion_synced'
);

CREATE TABLE task_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action task_action NOT NULL,
  from_value TEXT,
  to_value TEXT,
  comment TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── 4. Task comments (threaded) ────────────────────────────────────────────

CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  attachments TEXT[] DEFAULT '{}',
  parent_id UUID REFERENCES task_comments(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── 5. Deadline extension requests ─────────────────────────────────────────

CREATE TYPE extension_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE deadline_extension_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),
  original_due_date DATE NOT NULL,
  requested_due_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status extension_status NOT NULL DEFAULT 'pending',
  decided_by UUID REFERENCES users(id),
  decision_note TEXT,
  decided_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── 6. Task notifications (in-app, separate from Supabase meeting notifs) ─

CREATE TYPE task_notification_type AS ENUM (
  'task_assigned', 'task_overdue', 'task_rejected', 'task_submitted',
  'task_verified', 'extension_requested', 'extension_decided',
  'comment_added', 'task_reminder'
);

CREATE TABLE task_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type task_notification_type NOT NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── 7. Indexes ─────────────────────────────────────────────────────────────

CREATE INDEX idx_tasks_assignee_status ON tasks(assignee_id, status);
CREATE INDEX idx_tasks_agency ON tasks(agency);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_notion_page ON tasks(notion_page_id) WHERE notion_page_id IS NOT NULL;

CREATE INDEX idx_task_activities_task ON task_activities(task_id);
CREATE INDEX idx_task_activities_created ON task_activities(created_at DESC);

CREATE INDEX idx_task_comments_task ON task_comments(task_id);

CREATE INDEX idx_extension_requests_task ON deadline_extension_requests(task_id);
CREATE INDEX idx_extension_requests_status ON deadline_extension_requests(status) WHERE status = 'pending';

CREATE INDEX idx_task_notifications_user ON task_notifications(user_id, is_read);
CREATE INDEX idx_task_notifications_created ON task_notifications(created_at DESC);

-- ── 8. Triggers ────────────────────────────────────────────────────────────

CREATE TRIGGER tr_tasks_updated
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_task_comments_updated
  BEFORE UPDATE ON task_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
