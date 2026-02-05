-- GPL Forecasting Tables Migration
-- Stores computed forecasts, reliability metrics, and AI strategic analysis

-- Demand forecasts (combined from daily + monthly data)
CREATE TABLE IF NOT EXISTS gpl_forecast_demand (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_date DATE NOT NULL,              -- When forecast was computed
  projected_month DATE NOT NULL,            -- Month being projected
  grid VARCHAR(20) DEFAULT 'DBIS',          -- 'DBIS' or 'Essequibo'
  projected_peak_mw NUMERIC(10, 2),
  confidence_low_mw NUMERIC(10, 2),
  confidence_high_mw NUMERIC(10, 2),
  growth_rate_pct NUMERIC(6, 2),            -- YoY or trend growth rate
  data_source VARCHAR(20),                  -- 'daily', 'monthly', 'combined'
  computed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(forecast_date, projected_month, grid)
);

-- Capacity forecasts and adequacy timeline
CREATE TABLE IF NOT EXISTS gpl_forecast_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_date DATE NOT NULL,
  grid VARCHAR(20) DEFAULT 'DBIS',
  current_capacity_mw NUMERIC(10, 2),
  projected_capacity_mw NUMERIC(10, 2),
  shortfall_date DATE,                      -- When demand exceeds capacity
  reserve_margin_pct NUMERIC(6, 2),
  months_until_shortfall INT,
  risk_level VARCHAR(20),                   -- 'critical', 'warning', 'safe'
  computed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(forecast_date, grid)
);

-- Load shedding analysis
CREATE TABLE IF NOT EXISTS gpl_forecast_load_shedding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_date DATE NOT NULL,
  period_days INT DEFAULT 30,               -- Rolling window analyzed
  avg_shed_mw NUMERIC(10, 2),
  max_shed_mw NUMERIC(10, 2),
  shed_days_count INT,                      -- Days with shedding
  trend VARCHAR(20),                        -- 'increasing', 'stable', 'decreasing'
  projected_avg_6mo NUMERIC(10, 2),
  computed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(forecast_date, period_days)
);

-- Station reliability metrics
CREATE TABLE IF NOT EXISTS gpl_forecast_station_reliability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_date DATE NOT NULL,
  station VARCHAR(50) NOT NULL,
  period_days INT DEFAULT 90,               -- Analysis window
  uptime_pct NUMERIC(6, 2),
  avg_utilization_pct NUMERIC(6, 2),
  total_units INT,
  online_units INT,
  offline_units INT,
  failure_count INT,
  mtbf_days NUMERIC(10, 2),                 -- Mean time between failures
  trend VARCHAR(20),                        -- 'improving', 'stable', 'declining'
  risk_level VARCHAR(20),                   -- 'critical', 'warning', 'good'
  computed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(forecast_date, station, period_days)
);

-- Unit-level failure risk
CREATE TABLE IF NOT EXISTS gpl_forecast_unit_risk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_date DATE NOT NULL,
  station VARCHAR(50) NOT NULL,
  engine VARCHAR(50),
  unit_number VARCHAR(20),
  derated_mw NUMERIC(10, 2),
  uptime_pct_90d NUMERIC(6, 2),
  failure_count_90d INT,
  mtbf_days NUMERIC(10, 2),
  days_since_last_failure INT,
  predicted_failure_days INT,               -- Days until likely failure
  risk_level VARCHAR(20),                   -- 'high', 'medium', 'low'
  risk_score NUMERIC(6, 2),                 -- 0-100
  computed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(forecast_date, station, unit_number)
);

-- Reserve margin forecasts
CREATE TABLE IF NOT EXISTS gpl_forecast_reserve (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_date DATE NOT NULL,
  projected_month DATE NOT NULL,
  projected_reserve_mw NUMERIC(10, 2),
  projected_reserve_pct NUMERIC(6, 2),
  below_threshold BOOLEAN DEFAULT FALSE,    -- Below 15% safety threshold
  risk_level VARCHAR(20),
  computed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(forecast_date, projected_month)
);

-- Monthly KPI forecasts (for all 8 KPIs)
CREATE TABLE IF NOT EXISTS gpl_forecast_kpi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_date DATE NOT NULL,
  kpi_name VARCHAR(100) NOT NULL,
  projected_month DATE NOT NULL,
  projected_value NUMERIC(12, 4),
  confidence_low NUMERIC(12, 4),
  confidence_high NUMERIC(12, 4),
  trend VARCHAR(20),
  computed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(forecast_date, kpi_name, projected_month)
);

-- AI Strategic Analysis
CREATE TABLE IF NOT EXISTS gpl_forecast_ai_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_type VARCHAR(50) DEFAULT 'strategic_briefing',
  data_through_date DATE,                   -- Latest data included
  daily_data_points INT,
  monthly_data_points INT,
  executive_briefing TEXT,                  -- Main AI output
  demand_outlook TEXT,
  capacity_risk TEXT,
  infrastructure_reliability TEXT,
  customer_revenue_impact TEXT,
  essequibo_assessment TEXT,
  recommendations JSONB,
  raw_response JSONB,
  prompt_tokens INT,
  completion_tokens INT,
  processing_time_ms INT,
  generated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_forecast_demand_month ON gpl_forecast_demand(projected_month);
CREATE INDEX IF NOT EXISTS idx_forecast_station_reliability_station ON gpl_forecast_station_reliability(station);
CREATE INDEX IF NOT EXISTS idx_forecast_unit_risk_level ON gpl_forecast_unit_risk(risk_level);
CREATE INDEX IF NOT EXISTS idx_forecast_ai_date ON gpl_forecast_ai_analysis(generated_at DESC);

-- Comments
COMMENT ON TABLE gpl_forecast_demand IS 'Peak demand projections using daily and monthly historical data';
COMMENT ON TABLE gpl_forecast_station_reliability IS 'Station uptime, utilization, and failure metrics';
COMMENT ON TABLE gpl_forecast_unit_risk IS 'Individual unit failure risk predictions';
COMMENT ON TABLE gpl_forecast_ai_analysis IS 'AI-generated strategic briefings for Director General';
