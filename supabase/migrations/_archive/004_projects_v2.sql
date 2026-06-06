-- =====================================================
-- MIGRATION: Projects V2 — Oversight Format
-- =====================================================

-- Drop old tables (cascade snapshots)
DROP TABLE IF EXISTS project_snapshots CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
-- Keep project_uploads, just ensure it exists

-- Recreate projects table matching Oversight export
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT UNIQUE NOT NULL,         -- e.g. "GPLXXX202601X27458"
  executing_agency TEXT,                    -- e.g. "MOPUA"
  sub_agency TEXT,                          -- e.g. "GPL", "GWI", "HECI", etc.
  project_name TEXT,
  region TEXT,                              -- "01" through "10" or null
  contract_value NUMERIC,                   -- dollar amount, nullable
  contractor TEXT,
  project_end_date DATE,                    -- nullable
  completion_pct NUMERIC DEFAULT 0,         -- 0-100
  has_images INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_projects_sub_agency ON projects(sub_agency);
CREATE INDEX idx_projects_region ON projects(region);
CREATE INDEX idx_projects_completion ON projects(completion_pct);
CREATE INDEX idx_projects_end_date ON projects(project_end_date);

-- Ensure project_uploads exists
CREATE TABLE IF NOT EXISTS project_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT,
  project_count INTEGER,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
