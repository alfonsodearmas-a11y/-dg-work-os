-- ============================================================
-- agency_psip_focal_point_history — audit log of focal-point edits
--
-- Written by the admin handler on every PATCH to
-- agency_psip_focal_point. One row per field changed per write.
-- ============================================================

CREATE TABLE IF NOT EXISTS agency_psip_focal_point_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency      TEXT NOT NULL,
  field       TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  changed_by  UUID NOT NULL REFERENCES users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agency_psip_focal_point_history_agency_time
  ON agency_psip_focal_point_history (agency, changed_at DESC);

ALTER TABLE agency_psip_focal_point_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read agency_psip_focal_point_history"
  ON agency_psip_focal_point_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full agency_psip_focal_point_history"
  ON agency_psip_focal_point_history FOR ALL TO service_role USING (true) WITH CHECK (true);
