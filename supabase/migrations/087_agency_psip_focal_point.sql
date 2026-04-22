-- ============================================================
-- agency_psip_focal_point — who to email about PSIP gaps
--
-- One row per agency. focal_point_email is the primary recipient for
-- weekly missing-data nags; agency_head_email is added to TO when a
-- tender has been nagged 3+ consecutive weeks.
--
-- Empty email = no emails sent to that agency. Valid state — the nag
-- pipeline skips agencies without a focal point email.
-- ============================================================

CREATE TABLE IF NOT EXISTS agency_psip_focal_point (
  agency             TEXT PRIMARY KEY,
  focal_point_name   TEXT NOT NULL DEFAULT '',
  focal_point_email  TEXT NOT NULL DEFAULT '',
  agency_head_name   TEXT,
  agency_head_email  TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID REFERENCES users(id)
);

-- Seed one row per known PSIP agency so the admin UI has all rows to edit.
INSERT INTO agency_psip_focal_point (agency) VALUES
  ('GPL'), ('GWI'), ('GCAA'), ('CJIA'), ('MARAD'), ('HECI'), ('HINTERLAND_AIRSTRIPS')
ON CONFLICT (agency) DO NOTHING;

ALTER TABLE agency_psip_focal_point ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read agency_psip_focal_point"
  ON agency_psip_focal_point FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full agency_psip_focal_point"
  ON agency_psip_focal_point FOR ALL TO service_role USING (true) WITH CHECK (true);
