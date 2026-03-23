-- ============================================================
-- Application Notes — immutable, timestamped notes/commentary
-- Separate from activity_log (system-generated events)
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_application_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES customer_applications(id) ON DELETE CASCADE,
  note_text       TEXT NOT NULL,
  status_at_time  TEXT,
  new_status      TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_notes_application ON customer_application_notes(application_id);
CREATE INDEX idx_app_notes_created ON customer_application_notes(created_at DESC);

-- RLS
ALTER TABLE customer_application_notes ENABLE ROW LEVEL SECURITY;

-- DG: full access
CREATE POLICY can_dg_all ON customer_application_notes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = (auth.jwt()->>'userId')::uuid AND role = 'dg')
  );

-- Agency staff: SELECT where parent application's agency matches
CREATE POLICY can_agency_select ON customer_application_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customer_applications ca
      WHERE ca.id = application_id
        AND ca.agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
    )
  );

-- Agency staff: INSERT where parent application's agency matches
CREATE POLICY can_agency_insert ON customer_application_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM customer_applications ca
      WHERE ca.id = application_id
        AND ca.agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
    )
  );

-- No UPDATE or DELETE policies — notes are immutable (logbook pattern)
