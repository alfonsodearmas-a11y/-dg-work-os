-- Service Connection Efficiency Tracking: lifecycle records for every GPL service order

-- Persistent lifecycle record for every service order
CREATE TABLE IF NOT EXISTS service_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_reference TEXT,
  service_order_number TEXT,
  first_name TEXT,
  last_name TEXT,
  telephone TEXT,
  region TEXT,
  district TEXT,
  village_ward TEXT,
  street TEXT,
  lot TEXT,
  account_type TEXT,
  service_order_type TEXT,
  division_code TEXT,
  cycle TEXT,
  application_date DATE,
  track TEXT CHECK (track IN ('A', 'B', 'unknown')) DEFAULT 'unknown',
  job_complexity TEXT CHECK (job_complexity IN ('simple', 'extensive', 'unknown')) DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled', 'legacy_excluded')),
  current_stage TEXT,
  stage_history JSONB DEFAULT '[]',
  first_seen_date DATE,
  last_seen_date DATE,
  disappeared_date DATE,
  energisation_date DATE,
  total_days_to_complete INTEGER,
  is_legacy BOOLEAN DEFAULT FALSE,
  linked_so_number TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Natural key: customer_reference + service_order_number (both non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sc_natural_key
  ON service_connections(customer_reference, service_order_number)
  WHERE customer_reference IS NOT NULL AND service_order_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sc_status ON service_connections(status);
CREATE INDEX IF NOT EXISTS idx_sc_track ON service_connections(track);
CREATE INDEX IF NOT EXISTS idx_sc_region ON service_connections(region);
CREATE INDEX IF NOT EXISTS idx_sc_current_stage ON service_connections(current_stage);
CREATE INDEX IF NOT EXISTS idx_sc_application_date ON service_connections(application_date);
CREATE INDEX IF NOT EXISTS idx_sc_disappeared_date ON service_connections(disappeared_date);
CREATE INDEX IF NOT EXISTS idx_sc_customer_ref ON service_connections(customer_reference);

-- Pre-computed monthly aggregates for PUC reporting
CREATE TABLE IF NOT EXISTS service_connection_monthly_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_month DATE NOT NULL, -- first day of month
  opened_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  queue_depth INTEGER NOT NULL DEFAULT 0,
  avg_days_to_complete NUMERIC(8,2),
  median_days_to_complete NUMERIC(8,2),
  pct_within_sla NUMERIC(5,2),
  track_a_completed INTEGER DEFAULT 0,
  track_a_avg_days NUMERIC(8,2),
  track_a_sla_pct NUMERIC(5,2),
  track_b_completed INTEGER DEFAULT 0,
  track_b_avg_days NUMERIC(8,2),
  track_b_sla_pct NUMERIC(5,2),
  stage_breakdown JSONB DEFAULT '{}',
  complexity_breakdown JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (report_month)
);

CREATE INDEX IF NOT EXISTS idx_scms_month ON service_connection_monthly_stats(report_month DESC);

-- Cached AI analysis results
CREATE TABLE IF NOT EXISTS service_connection_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_date DATE NOT NULL DEFAULT CURRENT_DATE,
  analysis_type TEXT NOT NULL DEFAULT 'efficiency',
  result JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scai_date ON service_connection_ai_insights(analysis_date DESC);
