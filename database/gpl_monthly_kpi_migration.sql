-- GPL Monthly KPI Tables Migration
-- Run this to create tables for monthly KPI CSV uploads

-- Main table for monthly KPI values
CREATE TABLE IF NOT EXISTS gpl_monthly_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_month DATE NOT NULL,              -- First of month (e.g., 2025-12-01)
  kpi_name VARCHAR(100) NOT NULL,          -- One of 8 known KPIs
  value NUMERIC(12, 4),                    -- The actual value
  raw_value VARCHAR(100),                  -- Original value from CSV (for debugging)
  uploaded_at TIMESTAMP DEFAULT NOW(),
  uploaded_by VARCHAR(100),
  UNIQUE(report_month, kpi_name)           -- UPSERT key
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_gpl_monthly_kpis_month ON gpl_monthly_kpis(report_month DESC);
CREATE INDEX IF NOT EXISTS idx_gpl_monthly_kpis_kpi ON gpl_monthly_kpis(kpi_name);

-- Upload tracking table
CREATE TABLE IF NOT EXISTS gpl_kpi_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(500),
  file_size_bytes INTEGER,
  rows_parsed INTEGER,
  rows_inserted INTEGER,
  rows_updated INTEGER,
  date_range_start DATE,
  date_range_end DATE,
  kpis_found TEXT[],                       -- Array of KPI names found
  warnings JSONB,
  status VARCHAR(20) DEFAULT 'pending',    -- pending, confirmed, failed
  error_message TEXT,
  uploaded_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP
);

-- AI Analysis for KPI trends
CREATE TABLE IF NOT EXISTS gpl_kpi_ai_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID REFERENCES gpl_kpi_uploads(id) ON DELETE SET NULL,
  analysis_date DATE NOT NULL,             -- Date analysis was generated
  date_range_start DATE,                   -- Data range analyzed
  date_range_end DATE,
  analysis_model VARCHAR(100),
  analysis_status VARCHAR(20) DEFAULT 'pending',  -- pending, processing, completed, failed
  executive_briefing TEXT,                 -- Main AI output
  key_findings JSONB,                      -- Structured findings
  concerning_trends JSONB,                 -- Flagged issues
  raw_response JSONB,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  processing_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Index for latest analysis lookup
CREATE INDEX IF NOT EXISTS idx_gpl_kpi_analysis_date ON gpl_kpi_ai_analysis(analysis_date DESC);

-- Comments for documentation
COMMENT ON TABLE gpl_monthly_kpis IS 'Monthly KPI values from GPL CSV uploads';
COMMENT ON COLUMN gpl_monthly_kpis.report_month IS 'First day of the month this KPI represents';
COMMENT ON COLUMN gpl_monthly_kpis.kpi_name IS 'One of: Affected Customers, Collection Rate %, HFO Generation Mix %, LFO Generation Mix %, Installed Capacity DBIS, Installed Capacity Essequibo, Peak Demand DBIS, Peak Demand Essequibo';
COMMENT ON TABLE gpl_kpi_ai_analysis IS 'AI-generated analysis of KPI trends';
