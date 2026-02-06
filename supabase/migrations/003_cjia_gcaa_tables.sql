-- CJIA and GCAA Monthly Report + AI Insights Tables
-- Follows the same pattern as GWI tables (002_gwi_tables.sql)

-- ── CJIA Tables ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cjia_monthly_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_month DATE NOT NULL,
  operations_data JSONB DEFAULT '{}',
  passenger_data JSONB DEFAULT '{}',
  revenue_data JSONB DEFAULT '{}',
  project_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_month)
);

CREATE INDEX IF NOT EXISTS idx_cjia_monthly_month ON cjia_monthly_reports(report_month DESC);

CREATE TABLE IF NOT EXISTS cjia_ai_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_month DATE NOT NULL,
  insight_type TEXT NOT NULL DEFAULT 'monthly_analysis',
  insight_json JSONB NOT NULL,
  model_used TEXT,
  data_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_month, insight_type)
);

CREATE INDEX IF NOT EXISTS idx_cjia_insights_month ON cjia_ai_insights(report_month DESC);

-- ── GCAA Tables ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gcaa_monthly_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_month DATE NOT NULL,
  compliance_data JSONB DEFAULT '{}',
  inspection_data JSONB DEFAULT '{}',
  registration_data JSONB DEFAULT '{}',
  incident_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_month)
);

CREATE INDEX IF NOT EXISTS idx_gcaa_monthly_month ON gcaa_monthly_reports(report_month DESC);

CREATE TABLE IF NOT EXISTS gcaa_ai_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_month DATE NOT NULL,
  insight_type TEXT NOT NULL DEFAULT 'monthly_analysis',
  insight_json JSONB NOT NULL,
  model_used TEXT,
  data_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_month, insight_type)
);

CREATE INDEX IF NOT EXISTS idx_gcaa_insights_month ON gcaa_ai_insights(report_month DESC);
