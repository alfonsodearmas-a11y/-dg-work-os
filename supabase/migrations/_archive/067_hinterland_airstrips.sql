-- ============================================================
-- Migration 067: Hinterland Airstrips Module
-- Tracks 51+ hinterland airstrips: condition, maintenance,
-- inspections, photos (WhatsApp verification), status changes.
-- ============================================================

-- 1. Main airstrips table
CREATE TABLE IF NOT EXISTS airstrips (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL UNIQUE,
  region                INTEGER NOT NULL CHECK (region BETWEEN 1 AND 10),
  engineered_structure  BOOLEAN DEFAULT false,
  runway_length_m       NUMERIC(8,2),
  runway_width_m        NUMERIC(8,2),
  surface_type          TEXT,
  surface_condition     TEXT CHECK (surface_condition IN ('Good', 'Satisfactory', 'Poor')),
  last_inspection_date  DATE,
  flight_frequency      TEXT CHECK (flight_frequency IN ('Low', 'Moderate', 'High')),
  airside_buildings     TEXT,
  remarks               TEXT,
  status                TEXT NOT NULL DEFAULT 'operational'
                          CHECK (status IN (
                            'operational', 'limited', 'closed',
                            'under_rehabilitation', 'unknown'
                          )),
  coordinates_lat       NUMERIC(10,7),
  coordinates_lon       NUMERIC(10,7),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES users(id),
  updated_by            UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_airstrips_status ON airstrips(status);
CREATE INDEX IF NOT EXISTS idx_airstrips_region ON airstrips(region);

-- 2. Maintenance log — quarterly weeding/cleaning, pothole patching
CREATE TABLE IF NOT EXISTS airstrip_maintenance_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airstrip_id           UUID NOT NULL REFERENCES airstrips(id) ON DELETE CASCADE,
  activity_type         TEXT NOT NULL
                          CHECK (activity_type IN (
                            'weeding_cleaning', 'pothole_patching', 'other'
                          )),
  activity_description  TEXT,
  performed_date        DATE NOT NULL,
  quarter               TEXT,
  contractor_name       TEXT,
  verification_method   TEXT NOT NULL
                          CHECK (verification_method IN (
                            'whatsapp_photo', 'physical_inspection', 'unverified'
                          )),
  verified              BOOLEAN DEFAULT false,
  verified_by           UUID REFERENCES users(id),
  verified_at           TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_airstrip_maintenance_airstrip ON airstrip_maintenance_log(airstrip_id);
CREATE INDEX IF NOT EXISTS idx_airstrip_maintenance_quarter ON airstrip_maintenance_log(quarter);
CREATE INDEX IF NOT EXISTS idx_airstrip_maintenance_date ON airstrip_maintenance_log(performed_date DESC);

-- 3. Photos — verification, inspection, aerial, damage, general
CREATE TABLE IF NOT EXISTS airstrip_photos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airstrip_id           UUID NOT NULL REFERENCES airstrips(id) ON DELETE CASCADE,
  maintenance_log_id    UUID REFERENCES airstrip_maintenance_log(id) ON DELETE SET NULL,
  storage_path          TEXT NOT NULL,
  file_name             TEXT,
  caption               TEXT,
  photo_type            TEXT CHECK (photo_type IN (
                          'verification', 'inspection', 'aerial', 'damage', 'general'
                        )),
  taken_at              DATE,
  uploaded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by           UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_airstrip_photos_airstrip ON airstrip_photos(airstrip_id);
CREATE INDEX IF NOT EXISTS idx_airstrip_photos_maintenance ON airstrip_photos(maintenance_log_id);

-- 4. Inspections — field inspection records
CREATE TABLE IF NOT EXISTS airstrip_inspections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airstrip_id             UUID NOT NULL REFERENCES airstrips(id) ON DELETE CASCADE,
  inspection_date         DATE NOT NULL,
  inspector_name          TEXT,
  surface_condition       TEXT CHECK (surface_condition IN ('Good', 'Satisfactory', 'Poor')),
  runway_condition_notes  TEXT,
  vegetation_status       TEXT CHECK (vegetation_status IN (
                            'cleared', 'overgrown', 'partially_cleared'
                          )),
  drainage_condition      TEXT,
  buildings_condition     TEXT,
  findings                TEXT,
  recommendations         TEXT,
  signal_available        BOOLEAN,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_airstrip_inspections_airstrip ON airstrip_inspections(airstrip_id);
CREATE INDEX IF NOT EXISTS idx_airstrip_inspections_date ON airstrip_inspections(inspection_date DESC);

-- 5. Status log — audit trail of status transitions
CREATE TABLE IF NOT EXISTS airstrip_status_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airstrip_id       UUID NOT NULL REFERENCES airstrips(id) ON DELETE CASCADE,
  previous_status   TEXT,
  new_status        TEXT NOT NULL,
  changed_by        UUID REFERENCES users(id),
  reason            TEXT,
  changed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_airstrip_status_log_airstrip ON airstrip_status_log(airstrip_id);

-- ============================================================
-- updated_at trigger for airstrips
-- ============================================================

CREATE OR REPLACE FUNCTION update_airstrips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_airstrips_updated_at
  BEFORE UPDATE ON airstrips
  FOR EACH ROW
  EXECUTE FUNCTION update_airstrips_updated_at();

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE airstrips ENABLE ROW LEVEL SECURITY;
ALTER TABLE airstrip_maintenance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE airstrip_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE airstrip_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE airstrip_status_log ENABLE ROW LEVEL SECURITY;

-- ---- airstrips ----

-- All authenticated users can view airstrips
CREATE POLICY as_authenticated_select ON airstrips
  FOR SELECT TO authenticated
  USING (true);

-- DG/Minister/PS: full write access
CREATE POLICY as_ministry_all ON airstrips
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role IN ('dg', 'minister', 'ps')
    )
  );

-- Agency admin: INSERT and UPDATE
CREATE POLICY as_agency_admin_insert ON airstrips
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role = 'agency_admin'
    )
  );

CREATE POLICY as_agency_admin_update ON airstrips
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role = 'agency_admin'
    )
  );

-- ---- airstrip_maintenance_log ----

CREATE POLICY aml_authenticated_select ON airstrip_maintenance_log
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY aml_ministry_all ON airstrip_maintenance_log
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role IN ('dg', 'minister', 'ps')
    )
  );

CREATE POLICY aml_agency_admin_insert ON airstrip_maintenance_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role = 'agency_admin'
    )
  );

CREATE POLICY aml_agency_admin_update ON airstrip_maintenance_log
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role = 'agency_admin'
    )
  );

-- ---- airstrip_photos ----

CREATE POLICY ap_authenticated_select ON airstrip_photos
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY ap_ministry_all ON airstrip_photos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role IN ('dg', 'minister', 'ps')
    )
  );

CREATE POLICY ap_agency_admin_insert ON airstrip_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role = 'agency_admin'
    )
  );

-- Own uploads: DELETE
CREATE POLICY ap_own_delete ON airstrip_photos
  FOR DELETE TO authenticated
  USING (uploaded_by = (auth.jwt()->>'userId')::uuid);

-- ---- airstrip_inspections ----

CREATE POLICY ai_authenticated_select ON airstrip_inspections
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY ai_ministry_all ON airstrip_inspections
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role IN ('dg', 'minister', 'ps')
    )
  );

CREATE POLICY ai_agency_admin_insert ON airstrip_inspections
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role = 'agency_admin'
    )
  );

-- ---- airstrip_status_log ----

-- All authenticated: SELECT
CREATE POLICY asl_authenticated_select ON airstrip_status_log
  FOR SELECT TO authenticated
  USING (true);

-- DG/Minister/PS + agency_admin: INSERT only (audit trail is immutable)
CREATE POLICY asl_ministry_insert ON airstrip_status_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role IN ('dg', 'minister', 'ps', 'agency_admin')
    )
  );

-- ============================================================
-- Storage bucket for airstrip photos
-- ============================================================
-- NOTE: Run via Supabase dashboard or CLI:
--   supabase storage create airstrip-photos
-- Path convention: {airstrip_id}/{photo_type}/{file_name}
