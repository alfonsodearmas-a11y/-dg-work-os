-- Pending Applications V2: GPL pipeline tracking, snapshots, and AI analyses

-- Add GPL-specific columns to pending_applications
ALTER TABLE pending_applications ADD COLUMN IF NOT EXISTS pipeline_stage TEXT;
ALTER TABLE pending_applications ADD COLUMN IF NOT EXISTS account_type TEXT;
ALTER TABLE pending_applications ADD COLUMN IF NOT EXISTS service_order_type TEXT;
ALTER TABLE pending_applications ADD COLUMN IF NOT EXISTS service_order_number TEXT;
ALTER TABLE pending_applications ADD COLUMN IF NOT EXISTS account_status TEXT;
ALTER TABLE pending_applications ADD COLUMN IF NOT EXISTS cycle TEXT;
ALTER TABLE pending_applications ADD COLUMN IF NOT EXISTS division_code TEXT;

CREATE INDEX IF NOT EXISTS idx_pending_applications_pipeline_stage ON pending_applications(pipeline_stage);

-- Snapshots: track pending application counts over time
CREATE TABLE IF NOT EXISTS pending_application_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency TEXT NOT NULL CHECK (agency IN ('GPL', 'GWI')),
  snapshot_date DATE NOT NULL,
  total_count INTEGER NOT NULL,
  summary_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (agency, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_pa_snapshots_agency_date ON pending_application_snapshots(agency, snapshot_date DESC);

-- AI analyses: store generated deep analysis results
CREATE TABLE IF NOT EXISTS pending_application_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency TEXT NOT NULL CHECK (agency IN ('GPL', 'GWI')),
  analysis_date DATE NOT NULL DEFAULT CURRENT_DATE,
  analysis_type TEXT NOT NULL DEFAULT 'deep',
  result JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pa_analyses_agency_date ON pending_application_analyses(agency, analysis_date DESC);
