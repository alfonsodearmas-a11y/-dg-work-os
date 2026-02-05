-- ============================================================================
-- SEED DATA FOR MINISTRY DASHBOARD
-- Run after schema.sql to populate with sample data
-- ============================================================================

-- Agency Admin Users (Password: Admin@2024 for all)
INSERT INTO users (username, email, password_hash, first_name, last_name, role_id, agency_id, must_change_password)
SELECT 'cjia.admin', 'admin@cjia.gov.gy', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYuuxTpK0Kua',
       'CJIA', 'Administrator', r.id, a.id, true
FROM roles r, agencies a WHERE r.name = 'agency_admin' AND a.code = 'CJIA'
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (username, email, password_hash, first_name, last_name, role_id, agency_id, must_change_password)
SELECT 'gwi.admin', 'admin@gwi.gov.gy', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYuuxTpK0Kua',
       'GWI', 'Administrator', r.id, a.id, true
FROM roles r, agencies a WHERE r.name = 'agency_admin' AND a.code = 'GWI'
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (username, email, password_hash, first_name, last_name, role_id, agency_id, must_change_password)
SELECT 'gpl.admin', 'admin@gpl.gov.gy', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYuuxTpK0Kua',
       'GPL', 'Administrator', r.id, a.id, true
FROM roles r, agencies a WHERE r.name = 'agency_admin' AND a.code = 'GPL'
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (username, email, password_hash, first_name, last_name, role_id, agency_id, must_change_password)
SELECT 'gcaa.admin', 'admin@gcaa.gov.gy', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYuuxTpK0Kua',
       'GCAA', 'Administrator', r.id, a.id, true
FROM roles r, agencies a WHERE r.name = 'agency_admin' AND a.code = 'GCAA'
ON CONFLICT (username) DO NOTHING;

-- Sample CJIA Metrics (last 7 days)
INSERT INTO cjia_metrics (report_date, passenger_arrivals, passenger_departures, on_time_departure_percent,
    revenue_mtd, revenue_target, safety_incidents, power_uptime_percent, baggage_uptime_percent, 
    security_uptime_percent, status)
VALUES 
    (CURRENT_DATE - 6, 1180, 1150, 88.5, 38000000, 52000000, 0, 99.8, 98.2, 99.9, 'approved'),
    (CURRENT_DATE - 5, 1220, 1190, 91.2, 40500000, 52000000, 0, 99.9, 99.1, 99.9, 'approved'),
    (CURRENT_DATE - 4, 1150, 1180, 87.3, 42800000, 52000000, 0, 99.7, 97.8, 99.8, 'approved'),
    (CURRENT_DATE - 3, 1280, 1250, 89.8, 45200000, 52000000, 0, 99.9, 98.5, 99.9, 'approved'),
    (CURRENT_DATE - 2, 1190, 1210, 90.5, 47500000, 52000000, 0, 99.8, 98.9, 99.9, 'approved'),
    (CURRENT_DATE - 1, 1250, 1230, 86.9, 49800000, 52000000, 0, 99.6, 97.5, 99.7, 'approved'),
    (CURRENT_DATE, 1300, 1275, 88.2, 52100000, 52000000, 0, 99.9, 98.8, 99.9, 'approved')
ON CONFLICT (report_date) DO NOTHING;

-- Sample GWI Metrics
INSERT INTO gwi_metrics (report_date, nrw_percent, water_produced_cubic_meters, water_billed_cubic_meters,
    active_disruptions, avg_response_time_hours, avg_repair_time_hours, customer_complaints_daily, status)
VALUES 
    (CURRENT_DATE - 6, 48.5, 125000, 64375, 3, 2.5, 4.8, 45, 'approved'),
    (CURRENT_DATE - 5, 47.8, 128000, 66816, 2, 2.3, 4.5, 38, 'approved'),
    (CURRENT_DATE - 4, 49.2, 122000, 61976, 4, 2.8, 5.2, 52, 'approved'),
    (CURRENT_DATE - 3, 48.1, 126000, 65394, 2, 2.4, 4.6, 41, 'approved'),
    (CURRENT_DATE - 2, 47.5, 130000, 68250, 1, 2.2, 4.3, 35, 'approved'),
    (CURRENT_DATE - 1, 48.8, 124000, 63488, 3, 2.6, 4.9, 48, 'approved'),
    (CURRENT_DATE, 47.2, 127000, 66956, 2, 2.4, 4.5, 40, 'approved')
ON CONFLICT (report_date) DO NOTHING;

-- Sample GPL Metrics
INSERT INTO gpl_metrics (report_date, current_load_mw, capacity_mw, active_outages, affected_customers,
    avg_restoration_time_hours, collection_rate_percent, hfo_generation_percent, lfo_generation_percent,
    solar_generation_percent, other_generation_percent, status)
VALUES 
    (CURRENT_DATE - 6, 142, 180, 3, 2500, 3.2, 82.5, 65, 25, 8, 2, 'approved'),
    (CURRENT_DATE - 5, 148, 180, 2, 1800, 2.8, 83.1, 64, 26, 8, 2, 'approved'),
    (CURRENT_DATE - 4, 155, 180, 4, 3200, 3.5, 81.8, 66, 24, 8, 2, 'approved'),
    (CURRENT_DATE - 3, 151, 180, 2, 1500, 2.5, 84.2, 63, 27, 8, 2, 'approved'),
    (CURRENT_DATE - 2, 145, 180, 1, 800, 2.2, 85.0, 62, 28, 8, 2, 'approved'),
    (CURRENT_DATE - 1, 158, 180, 3, 2100, 3.0, 83.5, 65, 25, 8, 2, 'approved'),
    (CURRENT_DATE, 152, 180, 2, 1200, 2.6, 84.8, 64, 26, 8, 2, 'approved')
ON CONFLICT (report_date) DO NOTHING;

-- Sample GCAA Metrics
INSERT INTO gcaa_metrics (report_date, active_aircraft_registrations, inspections_completed_mtd,
    inspections_target, compliance_rate_percent, incident_reports, renewals_pending, status)
VALUES 
    (CURRENT_DATE - 6, 47, 8, 12, 94.5, 0, 5, 'approved'),
    (CURRENT_DATE - 5, 47, 9, 12, 95.2, 0, 4, 'approved'),
    (CURRENT_DATE - 4, 48, 9, 12, 94.8, 1, 4, 'approved'),
    (CURRENT_DATE - 3, 48, 10, 12, 96.1, 0, 3, 'approved'),
    (CURRENT_DATE - 2, 48, 11, 12, 95.8, 0, 3, 'approved'),
    (CURRENT_DATE - 1, 48, 11, 12, 95.5, 0, 2, 'approved'),
    (CURRENT_DATE, 48, 12, 12, 96.2, 0, 2, 'approved')
ON CONFLICT (report_date) DO NOTHING;
