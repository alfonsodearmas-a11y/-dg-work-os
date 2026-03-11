-- GPL Service Connection Efficiency Module
-- New tables for the rebuilt module. Old tables (pending_applications, service_connections) left untouched.

-- Each upload creates one snapshot
CREATE TABLE IF NOT EXISTS gpl_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL UNIQUE,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  file_name TEXT,
  track_a_outstanding INT DEFAULT 0,
  track_a_completed INT DEFAULT 0,
  track_b_design_outstanding INT DEFAULT 0,
  track_b_execution_outstanding INT DEFAULT 0,
  track_b_design_completed INT DEFAULT 0,
  track_b_execution_completed INT DEFAULT 0,
  track_b_total_outstanding INT GENERATED ALWAYS AS
    (track_b_design_outstanding + track_b_execution_outstanding) STORED,
  data_quality_warnings JSONB DEFAULT '[]',
  warning_count INT DEFAULT 0,
  user_id UUID
);

CREATE INDEX IF NOT EXISTS idx_gpl_snapshots_date ON gpl_snapshots (snapshot_date DESC);

-- Outstanding records
CREATE TABLE IF NOT EXISTS gpl_outstanding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES gpl_snapshots(id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('A', 'B')),
  stage TEXT NOT NULL CHECK (stage IN ('metering', 'design', 'execution')),
  row_number INT,
  customer_number TEXT,
  account_number TEXT,
  customer_name TEXT,
  service_address TEXT,
  town_city TEXT,
  account_status TEXT,
  cycle TEXT,
  account_type TEXT,
  division_code TEXT,
  service_order_number TEXT,
  service_type TEXT,
  date_created TIMESTAMPTZ,
  current_date_ref DATE,
  days_elapsed INT,
  days_elapsed_calculated INT,
  UNIQUE(snapshot_id, account_number, service_order_number)
);

CREATE INDEX IF NOT EXISTS idx_gpl_outstanding_snapshot_track_stage ON gpl_outstanding (snapshot_id, track, stage);
CREATE INDEX IF NOT EXISTS idx_gpl_outstanding_account ON gpl_outstanding (account_number);

-- Completed records
CREATE TABLE IF NOT EXISTS gpl_completed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES gpl_snapshots(id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('A', 'B')),
  stage TEXT NOT NULL CHECK (stage IN ('metering', 'design', 'execution')),
  row_number INT,
  customer_number TEXT,
  account_number TEXT,
  customer_name TEXT,
  service_address TEXT,
  town_city TEXT,
  account_status TEXT,
  cycle TEXT,
  account_type TEXT,
  service_order_number TEXT,
  service_type TEXT,
  date_created TIMESTAMPTZ,
  date_completed DATE,
  created_by TEXT,
  days_taken INT,
  days_taken_calculated INT,
  is_data_quality_error BOOLEAN DEFAULT false,
  data_quality_note TEXT,
  UNIQUE(snapshot_id, account_number, service_order_number)
);

CREATE INDEX IF NOT EXISTS idx_gpl_completed_snapshot_track_stage ON gpl_completed (snapshot_id, track, stage);
CREATE INDEX IF NOT EXISTS idx_gpl_completed_account ON gpl_completed (account_number);
CREATE INDEX IF NOT EXISTS idx_gpl_completed_created_by ON gpl_completed (created_by);

-- Pre-computed metrics per snapshot per track+stage
CREATE TABLE IF NOT EXISTS gpl_snapshot_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES gpl_snapshots(id) ON DELETE CASCADE,
  track TEXT NOT NULL,
  stage TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('outstanding', 'completed')),
  total_count INT,
  valid_count INT,
  error_count INT DEFAULT 0,
  sla_target_days INT,
  within_sla_count INT,
  sla_compliance_pct NUMERIC(5,2),
  mean_days NUMERIC(6,2),
  median_days NUMERIC(6,2),
  trimmed_mean_days NUMERIC(6,2),
  mode_days INT,
  std_dev NUMERIC(6,2),
  min_days INT,
  max_days INT,
  q1 NUMERIC(6,2),
  q3 NUMERIC(6,2),
  p90 NUMERIC(6,2),
  p95 NUMERIC(6,2),
  ageing_buckets JSONB,
  staff_breakdown JSONB,
  UNIQUE(snapshot_id, track, stage, category)
);

CREATE INDEX IF NOT EXISTS idx_gpl_snapshot_metrics_snapshot ON gpl_snapshot_metrics (snapshot_id);

-- Chronic outlier watchlist
CREATE TABLE IF NOT EXISTS gpl_chronic_outliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number TEXT NOT NULL,
  customer_name TEXT,
  town_city TEXT,
  track TEXT NOT NULL,
  stage TEXT NOT NULL,
  service_order_number TEXT,
  first_seen_date DATE NOT NULL,
  first_seen_snapshot_id UUID REFERENCES gpl_snapshots(id),
  latest_snapshot_id UUID REFERENCES gpl_snapshots(id),
  latest_days_elapsed INT,
  consecutive_snapshots INT DEFAULT 1,
  date_created TIMESTAMPTZ,
  resolved BOOLEAN DEFAULT false,
  resolved_date DATE,
  UNIQUE(account_number, service_order_number)
);

CREATE INDEX IF NOT EXISTS idx_gpl_chronic_outliers_active ON gpl_chronic_outliers (resolved, track, stage);

-- RLS Policies
ALTER TABLE gpl_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE gpl_outstanding ENABLE ROW LEVEL SECURITY;
ALTER TABLE gpl_completed ENABLE ROW LEVEL SECURITY;
ALTER TABLE gpl_snapshot_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE gpl_chronic_outliers ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all GPL data
CREATE POLICY gpl_snapshots_read ON gpl_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY gpl_outstanding_read ON gpl_outstanding FOR SELECT TO authenticated USING (true);
CREATE POLICY gpl_completed_read ON gpl_completed FOR SELECT TO authenticated USING (true);
CREATE POLICY gpl_snapshot_metrics_read ON gpl_snapshot_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY gpl_chronic_outliers_read ON gpl_chronic_outliers FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert/update/delete (server-side uses service role key anyway)
CREATE POLICY gpl_snapshots_write ON gpl_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY gpl_outstanding_write ON gpl_outstanding FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY gpl_completed_write ON gpl_completed FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY gpl_snapshot_metrics_write ON gpl_snapshot_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY gpl_chronic_outliers_write ON gpl_chronic_outliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
