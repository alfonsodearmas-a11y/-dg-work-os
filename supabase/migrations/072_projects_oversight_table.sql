-- ============================================================================
-- 072: Projects Oversight Table
-- New table for ministry oversight dashboard data (synced daily via Claude Cowork)
-- ============================================================================

-- Table
CREATE TABLE IF NOT EXISTS projects_oversight (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER UNIQUE NOT NULL,                -- source "Project" column (e.g. 27617)
  project_reference TEXT,                            -- source reference code
  executing_agency TEXT DEFAULT 'MOPUA',
  sub_agency TEXT NOT NULL,                          -- GPL, GWI, GCAA, CJIA, MARAD, HECI, HAS
  project_name TEXT NOT NULL,
  region INTEGER CHECK (region >= 1 AND region <= 10),
  tender_board_type TEXT,                            -- e.g. NPTAB
  contract_value_total NUMERIC,                      -- sum of all lot values
  contract_lots JSONB DEFAULT '[]'::jsonb,           -- [{contractor: string, value: number}]
  contractors TEXT[],                                -- denormalized flat array for filtering
  project_end_date DATE,
  project_status TEXT DEFAULT 'NOT_STARTED',         -- DELAYED, ON_TRACK, COMPLETED, NOT_STARTED, COMMENCED, AWARDED
  completion_percent INTEGER DEFAULT 0 CHECK (completion_percent >= 0 AND completion_percent <= 100),
  has_images INTEGER DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_po_sub_agency ON projects_oversight(sub_agency);
CREATE INDEX idx_po_project_status ON projects_oversight(project_status);
CREATE INDEX idx_po_region ON projects_oversight(region);
CREATE INDEX idx_po_completion ON projects_oversight(completion_percent);
CREATE INDEX idx_po_contract_value ON projects_oversight(contract_value_total);
CREATE INDEX idx_po_contractors ON projects_oversight USING GIN (contractors);
CREATE INDEX idx_po_last_synced ON projects_oversight(last_synced_at);
CREATE INDEX idx_po_agency_status_region ON projects_oversight(sub_agency, project_status, region);

-- RLS (application-level role checks handle scoping; service role does all writes)
ALTER TABLE projects_oversight ENABLE ROW LEVEL SECURITY;
CREATE POLICY po_select ON projects_oversight FOR SELECT USING (true);
CREATE POLICY po_service_all ON projects_oversight FOR ALL USING (auth.role() = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_po_updated_at
  BEFORE UPDATE ON projects_oversight
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE projects_oversight;
