-- =====================================================
-- MIGRATION 033: Projects Oversight Enhancement
-- Adds health, escalation, notes, summaries, saved filters
-- =====================================================

-- 1. Add new columns to projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS health TEXT DEFAULT 'green' CHECK (health IN ('green', 'amber', 'red')),
  ADD COLUMN IF NOT EXISTS escalated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS escalation_reason TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS status_override TEXT CHECK (status_override IN ('not_started', 'in_progress', 'on_hold', 'delayed', 'completed', 'cancelled'));

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_projects_health ON projects(health);
CREATE INDEX IF NOT EXISTS idx_projects_escalated ON projects(escalated) WHERE escalated = TRUE;
CREATE INDEX IF NOT EXISTS idx_projects_assigned ON projects(assigned_to);
CREATE INDEX IF NOT EXISTS idx_projects_contractor ON projects(contractor);
CREATE INDEX IF NOT EXISTS idx_projects_contract_value ON projects(contract_value);
CREATE INDEX IF NOT EXISTS idx_projects_start_date ON projects(start_date);

-- 2. Project notes table
CREATE TABLE IF NOT EXISTS project_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  note_text TEXT NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'escalation', 'status_update')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_notes_project ON project_notes(project_id, created_at DESC);
CREATE INDEX idx_project_notes_user ON project_notes(user_id);

-- 3. Project summaries (AI cache)
CREATE TABLE IF NOT EXISTS project_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  summary JSONB NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id)
);

CREATE INDEX idx_project_summaries_project ON project_summaries(project_id);

-- 4. Saved filter presets
CREATE TABLE IF NOT EXISTS saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filter_name TEXT NOT NULL,
  filter_params JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_filters_user ON saved_filters(user_id);
