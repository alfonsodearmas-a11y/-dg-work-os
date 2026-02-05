-- ============================================
-- GPL DBIS Complete Redesign Migration
-- Unit-level tracking, outages, AI analysis
-- ============================================

-- ============================================
-- 1. GPL UPLOADS TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS gpl_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(500) NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    report_date DATE NOT NULL,
    detected_date DATE,
    date_column VARCHAR(10),

    -- Parsing stats
    units_parsed INTEGER DEFAULT 0,
    stations_parsed INTEGER DEFAULT 0,
    warnings JSONB DEFAULT '[]'::jsonb,

    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'preview', 'confirmed', 'failed', 'replaced')),
    error_message TEXT,

    -- Audit
    uploaded_by UUID,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    replaced_by UUID REFERENCES gpl_uploads(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gpl_uploads_date ON gpl_uploads(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_gpl_uploads_status ON gpl_uploads(status);

-- ============================================
-- 2. GPL DAILY UNITS (Individual generator data)
-- ============================================

CREATE TABLE IF NOT EXISTS gpl_daily_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upload_id UUID REFERENCES gpl_uploads(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,

    -- Unit identification
    row_number INTEGER NOT NULL,
    station VARCHAR(50) NOT NULL,
    engine VARCHAR(50),
    unit_number VARCHAR(20),

    -- Capacity data (static - from columns D, E, F)
    installed_capacity_mva DECIMAL(10,4),
    installed_capacity_mw DECIMAL(10,4),
    derated_capacity_mw DECIMAL(10,4),

    -- Daily data (from yesterday's column)
    available_mw DECIMAL(10,4),

    -- Computed fields
    status VARCHAR(20) CHECK (status IN ('online', 'offline', 'no_data')),
    utilization_pct DECIMAL(6,2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gpl_units_date ON gpl_daily_units(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_gpl_units_station ON gpl_daily_units(station);
CREATE INDEX IF NOT EXISTS idx_gpl_units_upload ON gpl_daily_units(upload_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gpl_units_unique ON gpl_daily_units(report_date, row_number);

-- ============================================
-- 3. GPL DAILY STATIONS (Aggregated station data)
-- ============================================

CREATE TABLE IF NOT EXISTS gpl_daily_stations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upload_id UUID REFERENCES gpl_uploads(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,

    -- Station identification
    station VARCHAR(50) NOT NULL,

    -- Aggregated capacity
    total_units INTEGER DEFAULT 0,
    total_derated_capacity_mw DECIMAL(10,4),
    total_available_mw DECIMAL(10,4),

    -- Unit status counts
    units_online INTEGER DEFAULT 0,
    units_offline INTEGER DEFAULT 0,
    units_no_data INTEGER DEFAULT 0,

    -- Computed
    station_utilization_pct DECIMAL(6,2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gpl_stations_date ON gpl_daily_stations(report_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gpl_stations_unique ON gpl_daily_stations(report_date, station);

-- ============================================
-- 4. GPL DAILY SUMMARY (System-wide metrics)
-- ============================================

CREATE TABLE IF NOT EXISTS gpl_daily_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upload_id UUID REFERENCES gpl_uploads(id) ON DELETE CASCADE,
    report_date DATE NOT NULL UNIQUE,

    -- Row 69: Total Fossil Fuel Capacity
    total_fossil_fuel_capacity_mw DECIMAL(10,4),

    -- Row 70: Expected Peak Demand
    expected_peak_demand_mw DECIMAL(10,4),

    -- Row 71: Reserve Capacity
    reserve_capacity_mw DECIMAL(10,4),

    -- Row 72: Average Forced Outage Rate
    average_for DECIMAL(8,6),

    -- Row 73: Expected Capacity
    expected_capacity_mw DECIMAL(10,4),

    -- Row 74: Expected Reserve
    expected_reserve_mw DECIMAL(10,4),

    -- Rows 75-78: Solar
    solar_hampshire_mwp DECIMAL(10,4),
    solar_prospect_mwp DECIMAL(10,4),
    solar_trafalgar_mwp DECIMAL(10,4),
    total_renewable_mwp DECIMAL(10,4),

    -- Row 79: Total DBIS Capacity
    total_dbis_capacity_mw DECIMAL(10,4),

    -- Row 80: Actual Evening Peak (parsed from "202.08(225.58)")
    evening_peak_on_bars_mw DECIMAL(10,4),
    evening_peak_suppressed_mw DECIMAL(10,4),

    -- Row 81: Actual Day Peak
    day_peak_on_bars_mw DECIMAL(10,4),
    day_peak_suppressed_mw DECIMAL(10,4),

    -- Row 82-83
    gen_availability_at_suppressed_peak DECIMAL(10,4),
    approx_suppressed_peak DECIMAL(10,4),

    -- Computed metrics
    system_utilization_pct DECIMAL(6,2),
    reserve_margin_pct DECIMAL(6,2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 5. GPL OUTAGES (From Generation Status sheet)
-- ============================================

CREATE TABLE IF NOT EXISTS gpl_outages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upload_id UUID REFERENCES gpl_uploads(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,

    -- Unit identification
    station VARCHAR(50) NOT NULL,
    engine VARCHAR(50),
    unit_number VARCHAR(20),

    -- Outage details
    reason TEXT,
    expected_completion DATE,
    actual_completion DATE,
    remarks TEXT,

    -- Status
    is_resolved BOOLEAN DEFAULT false,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gpl_outages_date ON gpl_outages(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_gpl_outages_station ON gpl_outages(station);

-- ============================================
-- 6. GPL AI ANALYSIS
-- ============================================

CREATE TABLE IF NOT EXISTS gpl_ai_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upload_id UUID REFERENCES gpl_uploads(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,

    -- Analysis metadata
    analysis_model VARCHAR(100) NOT NULL,
    analysis_status VARCHAR(20) DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed')),

    -- The executive briefing
    executive_briefing TEXT,

    -- Structured findings
    critical_alerts JSONB DEFAULT '[]'::jsonb,
    station_concerns JSONB DEFAULT '[]'::jsonb,
    recommendations JSONB DEFAULT '[]'::jsonb,

    -- Raw response
    raw_response JSONB,

    -- Performance
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    processing_time_ms INTEGER,

    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_gpl_analysis_date ON gpl_ai_analysis(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_gpl_analysis_upload ON gpl_ai_analysis(upload_id);

-- ============================================
-- 7. VIEWS FOR EASY QUERYING
-- ============================================

-- Latest summary with AI analysis
CREATE OR REPLACE VIEW v_gpl_latest_summary AS
SELECT
    s.*,
    a.executive_briefing,
    a.critical_alerts,
    a.analysis_status,
    u.filename,
    u.uploaded_by
FROM gpl_daily_summary s
LEFT JOIN gpl_ai_analysis a ON s.upload_id = a.upload_id
LEFT JOIN gpl_uploads u ON s.upload_id = u.id
WHERE u.status = 'confirmed'
ORDER BY s.report_date DESC
LIMIT 1;

-- Station overview for dashboard
CREATE OR REPLACE VIEW v_gpl_station_overview AS
SELECT
    report_date,
    station,
    total_units,
    total_derated_capacity_mw,
    total_available_mw,
    units_online,
    units_offline,
    units_no_data,
    station_utilization_pct,
    CASE
        WHEN station_utilization_pct >= 80 THEN 'good'
        WHEN station_utilization_pct >= 50 THEN 'warning'
        ELSE 'critical'
    END as health_status
FROM gpl_daily_stations
WHERE report_date = (SELECT MAX(report_date) FROM gpl_daily_stations)
ORDER BY station;

-- ============================================
-- 8. TRIGGERS
-- ============================================

CREATE TRIGGER tr_gpl_uploads_updated
    BEFORE UPDATE ON gpl_uploads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
