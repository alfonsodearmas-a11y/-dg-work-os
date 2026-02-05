-- ============================================
-- MINISTRY OF PUBLIC UTILITIES AND AVIATION
-- Dashboard Database Schema - PostgreSQL 14+
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('data_entry', 'supervisor', 'director', 'admin')),
    agency VARCHAR(20) CHECK (agency IN ('cjia', 'gwi', 'gpl', 'gcaa', 'ministry')),
    is_active BOOLEAN DEFAULT true,
    must_change_password BOOLEAN DEFAULT true,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- CJIA (Airport) Metrics
-- ============================================

CREATE TABLE cjia_daily_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_date DATE NOT NULL UNIQUE,
    arrivals INTEGER NOT NULL CHECK (arrivals >= 0),
    departures INTEGER NOT NULL CHECK (departures >= 0),
    on_time_departure_percent DECIMAL(5,2) NOT NULL CHECK (on_time_departure_percent BETWEEN 0 AND 100),
    revenue_mtd DECIMAL(15,2) NOT NULL CHECK (revenue_mtd >= 0),
    revenue_target DECIMAL(15,2) NOT NULL CHECK (revenue_target >= 0),
    safety_incidents INTEGER NOT NULL DEFAULT 0 CHECK (safety_incidents >= 0),
    safety_incident_details TEXT,
    power_uptime_percent DECIMAL(5,2) NOT NULL CHECK (power_uptime_percent BETWEEN 0 AND 100),
    baggage_uptime_percent DECIMAL(5,2) NOT NULL CHECK (baggage_uptime_percent BETWEEN 0 AND 100),
    security_uptime_percent DECIMAL(5,2) NOT NULL CHECK (security_uptime_percent BETWEEN 0 AND 100),
    submitted_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- GWI (Water) Metrics
-- ============================================

CREATE TABLE gwi_daily_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_date DATE NOT NULL UNIQUE,
    nrw_percent DECIMAL(5,2) NOT NULL CHECK (nrw_percent BETWEEN 0 AND 100),
    water_produced_cubic_meters DECIMAL(12,2) NOT NULL CHECK (water_produced_cubic_meters >= 0),
    water_billed_cubic_meters DECIMAL(12,2) NOT NULL CHECK (water_billed_cubic_meters >= 0),
    active_disruptions INTEGER NOT NULL DEFAULT 0 CHECK (active_disruptions >= 0),
    disruption_areas TEXT[],
    avg_response_time_hours DECIMAL(6,2) NOT NULL CHECK (avg_response_time_hours >= 0),
    avg_repair_time_hours DECIMAL(6,2) NOT NULL CHECK (avg_repair_time_hours >= 0),
    customer_complaints INTEGER DEFAULT 0,
    submitted_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- GPL (Electricity) Metrics
-- ============================================

CREATE TABLE gpl_daily_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_date DATE NOT NULL UNIQUE,
    current_load_mw DECIMAL(8,2) NOT NULL CHECK (current_load_mw >= 0),
    capacity_mw DECIMAL(8,2) NOT NULL CHECK (capacity_mw > 0),
    active_outages INTEGER NOT NULL DEFAULT 0 CHECK (active_outages >= 0),
    affected_customers INTEGER NOT NULL DEFAULT 0 CHECK (affected_customers >= 0),
    avg_restoration_time_hours DECIMAL(6,2) CHECK (avg_restoration_time_hours >= 0),
    collection_rate_percent DECIMAL(5,2) NOT NULL CHECK (collection_rate_percent BETWEEN 0 AND 100),
    hfo_generation_percent DECIMAL(5,2) NOT NULL CHECK (hfo_generation_percent BETWEEN 0 AND 100),
    lfo_generation_percent DECIMAL(5,2) NOT NULL CHECK (lfo_generation_percent BETWEEN 0 AND 100),
    solar_generation_percent DECIMAL(5,2) NOT NULL CHECK (solar_generation_percent BETWEEN 0 AND 100),
    other_generation_percent DECIMAL(5,2) NOT NULL CHECK (other_generation_percent BETWEEN 0 AND 100),
    submitted_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- GCAA (Civil Aviation) Metrics
-- ============================================

CREATE TABLE gcaa_daily_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_date DATE NOT NULL UNIQUE,
    active_aircraft_registrations INTEGER NOT NULL CHECK (active_aircraft_registrations >= 0),
    inspections_completed_mtd INTEGER NOT NULL CHECK (inspections_completed_mtd >= 0),
    inspections_target INTEGER NOT NULL CHECK (inspections_target >= 0),
    compliance_rate_percent DECIMAL(5,2) NOT NULL CHECK (compliance_rate_percent BETWEEN 0 AND 100),
    incident_reports INTEGER NOT NULL DEFAULT 0 CHECK (incident_reports >= 0),
    incident_details TEXT,
    renewals_pending INTEGER NOT NULL DEFAULT 0 CHECK (renewals_pending >= 0),
    submitted_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ALERTS
-- ============================================

CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency VARCHAR(20) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    metric_name VARCHAR(100) NOT NULL,
    current_value DECIMAL(15,2),
    threshold_value DECIMAL(15,2),
    message TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_agency ON users(agency);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX idx_cjia_date ON cjia_daily_metrics(report_date DESC);
CREATE INDEX idx_gwi_date ON gwi_daily_metrics(report_date DESC);
CREATE INDEX idx_gpl_date ON gpl_daily_metrics(report_date DESC);
CREATE INDEX idx_gcaa_date ON gcaa_daily_metrics(report_date DESC);
CREATE INDEX idx_alerts_active ON alerts(is_active) WHERE is_active = true;

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_cjia_updated BEFORE UPDATE ON cjia_daily_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_gwi_updated BEFORE UPDATE ON gwi_daily_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_gpl_updated BEFORE UPDATE ON gpl_daily_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_gcaa_updated BEFORE UPDATE ON gcaa_daily_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- SEED DATA
-- ============================================

-- Default users (Password: Ministry@2024)
INSERT INTO users (username, email, password_hash, full_name, role, agency, must_change_password) VALUES
('admin', 'admin@publicutilities.gov.gy', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VgPvAq5DOqy.Hy', 'System Administrator', 'admin', 'ministry', true),
('director', 'director@publicutilities.gov.gy', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VgPvAq5DOqy.Hy', 'Director General', 'director', 'ministry', true),
('cjia_user', 'data@cjia.gov.gy', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VgPvAq5DOqy.Hy', 'CJIA Data Officer', 'data_entry', 'cjia', true),
('gwi_user', 'data@gwi.gov.gy', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VgPvAq5DOqy.Hy', 'GWI Data Officer', 'data_entry', 'gwi', true),
('gpl_user', 'data@gpl.gov.gy', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VgPvAq5DOqy.Hy', 'GPL Data Officer', 'data_entry', 'gpl', true),
('gcaa_user', 'data@gcaa.gov.gy', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VgPvAq5DOqy.Hy', 'GCAA Data Officer', 'data_entry', 'gcaa', true);
