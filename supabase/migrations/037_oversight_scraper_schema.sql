-- =====================================================
-- MIGRATION 035: Oversight Scraper Schema Alignment
-- Adds missing columns to projects for detail-page data,
-- creates funding_distributions and project_progress_details tables
-- =====================================================

-- ===========================================
-- 1. Add missing columns to projects table
-- ===========================================
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS tender_board_type TEXT,
  ADD COLUMN IF NOT EXISTS balance_remaining NUMERIC,
  ADD COLUMN IF NOT EXISTS remarks TEXT,
  ADD COLUMN IF NOT EXISTS project_status TEXT,
  ADD COLUMN IF NOT EXISTS extension_reason TEXT,
  ADD COLUMN IF NOT EXISTS extension_date DATE,
  ADD COLUMN IF NOT EXISTS project_extended BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_projects_project_status ON projects(project_status);
CREATE INDEX IF NOT EXISTS idx_projects_extended ON projects(project_extended) WHERE project_extended = TRUE;

-- ===========================================
-- 2. Create funding_distributions table
-- ===========================================
CREATE TABLE IF NOT EXISTS funding_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  date_distributed DATE,
  payment_type TEXT,
  amount_distributed NUMERIC,
  amount_expended NUMERIC,
  distributed_balance NUMERIC,
  funding_remarks TEXT,
  contract_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_funding_dist_project ON funding_distributions(project_id);
CREATE INDEX idx_funding_dist_date ON funding_distributions(date_distributed);
CREATE INDEX idx_funding_dist_contract_ref ON funding_distributions(contract_ref);

-- ===========================================
-- 3. Create project_progress_details table
-- ===========================================
CREATE TABLE IF NOT EXISTS project_progress_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  expected_progress_description TEXT,
  expected_progress_value_pct NUMERIC,
  actual_progress_description TEXT,
  actual_progress_value_pct NUMERIC,
  record_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_progress_details_project ON project_progress_details(project_id);
CREATE INDEX idx_progress_details_date ON project_progress_details(record_date);

-- ===========================================
-- 4. RLS policies
-- ===========================================
ALTER TABLE funding_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_progress_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY funding_distributions_select ON funding_distributions
  FOR SELECT USING (true);

CREATE POLICY project_progress_details_select ON project_progress_details
  FOR SELECT USING (true);
