-- =====================================================
-- MIGRATION 035: Add short_name column to projects
-- Stores AI-generated concise display names (max 60 chars)
-- =====================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS short_name VARCHAR(60);

CREATE INDEX IF NOT EXISTS idx_projects_short_name ON projects(short_name);
