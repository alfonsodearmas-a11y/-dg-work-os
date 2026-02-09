-- ============================================
-- GPL DBIS (Demerara-Berbice Interconnected System) Schema Migration
-- Adds detailed power station data tracking
-- ============================================

-- ============================================
-- Power Station Reference Table
-- ============================================

CREATE TABLE IF NOT EXISTS gpl_power_stations (
    id SERIAL PRIMARY KEY,
    station_code VARCHAR(20) UNIQUE NOT NULL,
    station_name VARCHAR(100) NOT NULL,
    station_type VARCHAR(20) NOT NULL CHECK (station_type IN ('fossil', 'solar', 'hydro', 'wind')),
    location VARCHAR(100),
    installed_capacity_mw DECIMAL(8,2),
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert DBIS Power Stations
INSERT INTO gpl_power_stations (station_code, station_name, station_type, display_order) VALUES
    ('SEI', 'Skeldon Energy Inc', 'fossil', 1),
    ('CANEFIELD', 'Canefield', 'fossil', 2),
    ('DP1', 'Demerara Power 1', 'fossil', 3),
    ('DP2', 'Demerara Power 2', 'fossil', 4),
    ('DP3', 'Demerara Power 3', 'fossil', 5),
    ('DP4', 'Demerara Power 4', 'fossil', 6),
    ('DP5', 'Demerara Power 5', 'fossil', 7),
    ('COL', 'Columbia', 'fossil', 8),
    ('GOE', 'Garden of Eden', 'fossil', 9),
    ('PS1', 'Power Station 1', 'fossil', 10),
    ('PS2', 'Power Station 2', 'fossil', 11),
    ('HAMPSHIRE', 'Hampshire Solar', 'solar', 13),
    ('PROSPECT', 'Prospect Solar', 'solar', 14),
    ('TRAFALGAR', 'Trafalgar Solar', 'solar', 15)
ON CONFLICT (station_code) DO NOTHING;

-- ============================================
-- GPL DBIS Daily Report Table
-- ============================================

CREATE TABLE IF NOT EXISTS gpl_dbis_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_date DATE NOT NULL UNIQUE,

    -- Station Data (stored as JSONB for flexibility)
    -- Format: { "SEI": { "units": 2, "derated_mw": 25.5, "available_mw": 20.0 }, ... }
    station_data JSONB NOT NULL DEFAULT '{}',

    -- Solar/Renewable Capacity (MWp)
    hampshire_solar_mwp DECIMAL(6,2) DEFAULT 0,
    prospect_solar_mwp DECIMAL(6,2) DEFAULT 0,
    trafalgar_solar_mwp DECIMAL(6,2) DEFAULT 0,

    -- Calculated Totals
    total_fossil_capacity_mw DECIMAL(8,2) NOT NULL DEFAULT 0,
    total_renewable_capacity_mw DECIMAL(8,2) NOT NULL DEFAULT 0,
    total_dbis_capacity_mw DECIMAL(8,2) NOT NULL DEFAULT 0,

    -- Peak Demand
    evening_peak_onbars_mw DECIMAL(8,2),
    evening_peak_suppressed_mw DECIMAL(8,2),
    day_peak_onbars_mw DECIMAL(8,2),
    day_peak_suppressed_mw DECIMAL(8,2),

    -- Availability Metrics
    generation_availability_mw DECIMAL(8,2),
    fleet_availability_percent DECIMAL(5,2) CHECK (fleet_availability_percent BETWEEN 0 AND 100),
    reserve_margin_percent DECIMAL(5,2),

    -- Operational Metrics (kept for compatibility)
    active_outages INTEGER DEFAULT 0,
    affected_customers INTEGER DEFAULT 0,
    avg_restoration_time_hours DECIMAL(6,2),
    collection_rate_percent DECIMAL(5,2) CHECK (collection_rate_percent BETWEEN 0 AND 100),

    -- Generation Mix (percentages)
    hfo_generation_percent DECIMAL(5,2) CHECK (hfo_generation_percent BETWEEN 0 AND 100),
    lfo_generation_percent DECIMAL(5,2) CHECK (lfo_generation_percent BETWEEN 0 AND 100),
    solar_generation_percent DECIMAL(5,2) CHECK (solar_generation_percent BETWEEN 0 AND 100),
    other_generation_percent DECIMAL(5,2) CHECK (other_generation_percent BETWEEN 0 AND 100),

    -- Metadata
    submitted_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for efficient date queries
CREATE INDEX IF NOT EXISTS idx_gpl_dbis_date ON gpl_dbis_daily(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_gpl_dbis_status ON gpl_dbis_daily(status);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS tr_gpl_dbis_updated ON gpl_dbis_daily;
CREATE TRIGGER tr_gpl_dbis_updated
    BEFORE UPDATE ON gpl_dbis_daily
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- View for easy querying of latest DBIS data
-- ============================================

CREATE OR REPLACE VIEW gpl_dbis_latest AS
SELECT
    d.*,
    u.full_name as submitted_by_name,
    a.full_name as approved_by_name
FROM gpl_dbis_daily d
LEFT JOIN users u ON d.submitted_by = u.id
LEFT JOIN users a ON d.approved_by = a.id
WHERE d.status = 'approved'
ORDER BY d.report_date DESC
LIMIT 1;

-- ============================================
-- Function to calculate DBIS totals
-- ============================================

CREATE OR REPLACE FUNCTION calculate_dbis_totals()
RETURNS TRIGGER AS $$
DECLARE
    station_record RECORD;
    fossil_total DECIMAL(8,2) := 0;
    renewable_total DECIMAL(8,2) := 0;
BEGIN
    -- Calculate fossil fuel total from station data
    FOR station_record IN
        SELECT key, value->>'available_mw' as available_mw
        FROM jsonb_each(NEW.station_data)
        WHERE key NOT IN ('HAMPSHIRE', 'PROSPECT', 'TRAFALGAR')
    LOOP
        fossil_total := fossil_total + COALESCE(station_record.available_mw::DECIMAL, 0);
    END LOOP;

    -- Calculate renewable total
    renewable_total := COALESCE(NEW.hampshire_solar_mwp, 0) +
                       COALESCE(NEW.prospect_solar_mwp, 0) +
                       COALESCE(NEW.trafalgar_solar_mwp, 0);

    -- Set calculated fields
    NEW.total_fossil_capacity_mw := fossil_total;
    NEW.total_renewable_capacity_mw := renewable_total;
    NEW.total_dbis_capacity_mw := fossil_total + renewable_total;

    -- Calculate fleet availability if we have data
    IF NEW.total_dbis_capacity_mw > 0 AND NEW.generation_availability_mw IS NOT NULL THEN
        NEW.fleet_availability_percent := (NEW.generation_availability_mw / NEW.total_dbis_capacity_mw) * 100;
    END IF;

    -- Calculate reserve margin if we have peak demand
    IF NEW.evening_peak_onbars_mw > 0 AND NEW.generation_availability_mw IS NOT NULL THEN
        NEW.reserve_margin_percent := ((NEW.generation_availability_mw - NEW.evening_peak_onbars_mw) / NEW.evening_peak_onbars_mw) * 100;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-calculation
DROP TRIGGER IF EXISTS tr_gpl_dbis_calculate ON gpl_dbis_daily;
CREATE TRIGGER tr_gpl_dbis_calculate
    BEFORE INSERT OR UPDATE ON gpl_dbis_daily
    FOR EACH ROW EXECUTE FUNCTION calculate_dbis_totals();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON gpl_dbis_daily TO ministry_app;
GRANT SELECT ON gpl_power_stations TO ministry_app;
GRANT USAGE, SELECT ON SEQUENCE gpl_power_stations_id_seq TO ministry_app;
