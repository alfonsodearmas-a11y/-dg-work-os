-- ============================================
-- DAILY METRICS UPLOAD SYSTEM
-- Database Migration for Wide Excel Format
-- ============================================

-- ============================================
-- DAILY UPLOADS TRACKING
-- Tracks each upload attempt with metadata
-- ============================================

CREATE TABLE IF NOT EXISTS daily_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(500) NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    data_date DATE NOT NULL,
    detected_date DATE,
    date_match_exact BOOLEAN DEFAULT false,
    row_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'preview', 'confirmed', 'failed', 'replaced')),
    error_message TEXT,
    warnings JSONB DEFAULT '[]'::jsonb,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    confirmed_by UUID REFERENCES users(id),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    replaced_by UUID REFERENCES daily_uploads(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- DAILY METRICS
-- Stores extracted KPI values from Excel
-- ============================================

CREATE TABLE IF NOT EXISTS daily_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upload_id UUID NOT NULL REFERENCES daily_uploads(id) ON DELETE CASCADE,
    data_date DATE NOT NULL,
    row_number INTEGER NOT NULL,
    metric_name VARCHAR(500) NOT NULL,
    category VARCHAR(200),
    subcategory VARCHAR(200),
    agency VARCHAR(50),
    unit VARCHAR(100),
    raw_value TEXT,
    numeric_value DECIMAL(20,6),
    value_type VARCHAR(20) DEFAULT 'number' CHECK (value_type IN ('number', 'text', 'percentage', 'currency', 'error', 'empty')),
    has_error BOOLEAN DEFAULT false,
    error_detail TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint: one value per metric per date (allows upsert)
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_metrics_unique
    ON daily_metrics(data_date, row_number, metric_name);

-- ============================================
-- AI ANALYSIS RESULTS
-- Stores Claude analysis for each upload
-- ============================================

CREATE TABLE IF NOT EXISTS daily_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upload_id UUID NOT NULL REFERENCES daily_uploads(id) ON DELETE CASCADE,
    data_date DATE NOT NULL,
    analysis_model VARCHAR(100) NOT NULL,
    analysis_status VARCHAR(20) DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed')),

    -- Structured analysis results
    executive_summary TEXT,
    anomalies JSONB DEFAULT '[]'::jsonb,
    attention_items JSONB DEFAULT '[]'::jsonb,
    agency_summaries JSONB DEFAULT '{}'::jsonb,

    -- Raw API response for debugging
    raw_response JSONB,

    -- Performance metrics
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    processing_time_ms INTEGER,

    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- METRIC DEFINITIONS (Reference Table)
-- Maps row numbers to expected metrics
-- ============================================

CREATE TABLE IF NOT EXISTS metric_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    row_number INTEGER NOT NULL UNIQUE,
    metric_name VARCHAR(500) NOT NULL,
    category VARCHAR(200),
    subcategory VARCHAR(200),
    agency VARCHAR(50),
    unit VARCHAR(100),
    expected_type VARCHAR(20) DEFAULT 'number',
    min_value DECIMAL(20,6),
    max_value DECIMAL(20,6),
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_daily_uploads_date ON daily_uploads(data_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_uploads_status ON daily_uploads(status);
CREATE INDEX IF NOT EXISTS idx_daily_uploads_user ON daily_uploads(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_daily_uploads_created ON daily_uploads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics(data_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_upload ON daily_metrics(upload_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_category ON daily_metrics(category);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_agency ON daily_metrics(agency);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_name ON daily_metrics(metric_name);

CREATE INDEX IF NOT EXISTS idx_daily_analysis_date ON daily_analysis(data_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_analysis_upload ON daily_analysis(upload_id);
CREATE INDEX IF NOT EXISTS idx_daily_analysis_status ON daily_analysis(analysis_status);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER tr_daily_uploads_updated
    BEFORE UPDATE ON daily_uploads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_metric_definitions_updated
    BEFORE UPDATE ON metric_definitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get the latest upload for a given date
CREATE OR REPLACE FUNCTION get_latest_upload_for_date(target_date DATE)
RETURNS UUID AS $$
    SELECT id FROM daily_uploads
    WHERE data_date = target_date
      AND status = 'confirmed'
    ORDER BY created_at DESC
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Function to check if data exists for a date
CREATE OR REPLACE FUNCTION data_exists_for_date(target_date DATE)
RETURNS BOOLEAN AS $$
    SELECT EXISTS(
        SELECT 1 FROM daily_uploads
        WHERE data_date = target_date
          AND status = 'confirmed'
    );
$$ LANGUAGE SQL STABLE;

-- ============================================
-- VIEWS
-- ============================================

-- View: Latest metrics by date with analysis
CREATE OR REPLACE VIEW v_daily_metrics_summary AS
SELECT
    u.id AS upload_id,
    u.data_date,
    u.filename,
    u.row_count,
    u.status AS upload_status,
    u.created_at AS uploaded_at,
    usr.full_name AS uploaded_by_name,
    a.analysis_status,
    a.executive_summary,
    a.anomalies,
    a.attention_items
FROM daily_uploads u
JOIN users usr ON u.uploaded_by = usr.id
LEFT JOIN daily_analysis a ON u.id = a.upload_id
WHERE u.status = 'confirmed'
ORDER BY u.data_date DESC;

-- View: Metrics by agency for dashboard
CREATE OR REPLACE VIEW v_metrics_by_agency AS
SELECT
    m.data_date,
    m.agency,
    m.category,
    COUNT(*) AS metric_count,
    COUNT(*) FILTER (WHERE m.has_error) AS error_count,
    COUNT(*) FILTER (WHERE m.numeric_value IS NOT NULL) AS numeric_count
FROM daily_metrics m
JOIN daily_uploads u ON m.upload_id = u.id
WHERE u.status = 'confirmed'
GROUP BY m.data_date, m.agency, m.category
ORDER BY m.data_date DESC, m.agency;
