-- ============================================================
-- Migration 070: Airstrip Option Types (data-driven dropdowns)
-- Replaces hardcoded arrays for activity types, verification
-- methods, surface types, etc. with a generic lookup table.
-- ============================================================

-- 1. Lookup table
CREATE TABLE IF NOT EXISTS airstrip_option_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL,
  label       TEXT NOT NULL,
  value       TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category, value)
);

CREATE INDEX IF NOT EXISTS idx_airstrip_option_types_category
  ON airstrip_option_types(category, sort_order);

-- 2. Seed: Activity Types (expanded from 3 → 10)
INSERT INTO airstrip_option_types (category, label, value, sort_order) VALUES
  ('activity_type', 'Weeding & Cleaning',             'weeding_cleaning',     1),
  ('activity_type', 'Pothole Patching',                'pothole_patching',     2),
  ('activity_type', 'Runway Resurfacing',              'runway_resurfacing',   3),
  ('activity_type', 'Drainage Clearing',               'drainage_clearing',    4),
  ('activity_type', 'Lighting & PAPI Maintenance',     'lighting_papi',        5),
  ('activity_type', 'Fencing Repairs',                  'fencing_repairs',      6),
  ('activity_type', 'Vegetation Management',            'vegetation_management', 7),
  ('activity_type', 'Marking & Signage',                'marking_signage',      8),
  ('activity_type', 'Threshold/Overrun Maintenance',    'threshold_overrun',    9),
  ('activity_type', 'Other',                            'other',               99)
ON CONFLICT (category, value) DO NOTHING;

-- 3. Seed: Surface Types
INSERT INTO airstrip_option_types (category, label, value, sort_order) VALUES
  ('surface_type', 'Concrete',                       'concrete',    1),
  ('surface_type', 'Bituminous Surface Treatment',   'bituminous',  2),
  ('surface_type', 'Laterite',                       'laterite',    3),
  ('surface_type', 'Sand Clay',                      'sand_clay',   4),
  ('surface_type', 'Grass',                          'grass',       5),
  ('surface_type', 'Other',                          'other',      99)
ON CONFLICT (category, value) DO NOTHING;

-- 4. Seed: Verification Methods (expanded from 3 → 5)
INSERT INTO airstrip_option_types (category, label, value, sort_order) VALUES
  ('verification_method', 'Physical Inspection',  'physical_inspection', 1),
  ('verification_method', 'Photo Verification',   'photo_verification',  2),
  ('verification_method', 'WhatsApp Photo',       'whatsapp_photo',      3),
  ('verification_method', 'Contractor Report',    'contractor_report',   4),
  ('verification_method', 'Aerial Survey',        'aerial_survey',       5),
  ('verification_method', 'Unverified',           'unverified',          6),
  ('verification_method', 'Other',                'other',              99)
ON CONFLICT (category, value) DO NOTHING;

-- 5. Seed: Conditions
INSERT INTO airstrip_option_types (category, label, value, sort_order) VALUES
  ('condition', 'Good',          'Good',         1),
  ('condition', 'Satisfactory',  'Satisfactory', 2),
  ('condition', 'Poor',          'Poor',         3)
ON CONFLICT (category, value) DO NOTHING;

-- 6. Seed: Statuses
INSERT INTO airstrip_option_types (category, label, value, sort_order) VALUES
  ('status', 'Operational',          'operational',          1),
  ('status', 'Limited Operations',   'limited',              2),
  ('status', 'Under Rehabilitation', 'under_rehabilitation', 3),
  ('status', 'Closed',              'closed',                4),
  ('status', 'Unknown',             'unknown',               5)
ON CONFLICT (category, value) DO NOTHING;

-- 7. Seed: Flight Frequency
INSERT INTO airstrip_option_types (category, label, value, sort_order) VALUES
  ('flight_frequency', 'Low',      'Low',      1),
  ('flight_frequency', 'Moderate', 'Moderate', 2),
  ('flight_frequency', 'High',     'High',     3)
ON CONFLICT (category, value) DO NOTHING;

-- 8. Widen CHECK constraint on maintenance_log to accept new activity types
--    Drop old constraint and add a new, more permissive one.
ALTER TABLE airstrip_maintenance_log
  DROP CONSTRAINT IF EXISTS airstrip_maintenance_log_activity_type_check;

ALTER TABLE airstrip_maintenance_log
  ADD CONSTRAINT airstrip_maintenance_log_activity_type_check
  CHECK (activity_type IN (
    'weeding_cleaning', 'pothole_patching', 'runway_resurfacing',
    'drainage_clearing', 'lighting_papi', 'fencing_repairs',
    'vegetation_management', 'marking_signage', 'threshold_overrun',
    'other'
  ));

-- 9. Widen CHECK constraint on verification_method
ALTER TABLE airstrip_maintenance_log
  DROP CONSTRAINT IF EXISTS airstrip_maintenance_log_verification_method_check;

ALTER TABLE airstrip_maintenance_log
  ADD CONSTRAINT airstrip_maintenance_log_verification_method_check
  CHECK (verification_method IN (
    'physical_inspection', 'photo_verification', 'whatsapp_photo',
    'contractor_report', 'aerial_survey', 'unverified', 'other'
  ));

-- 10. RLS: read access for all authenticated roles, write for admins
ALTER TABLE airstrip_option_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY airstrip_option_types_read ON airstrip_option_types
  FOR SELECT USING (true);

CREATE POLICY airstrip_option_types_write ON airstrip_option_types
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') IN ('dg', 'minister', 'ps')
  );
