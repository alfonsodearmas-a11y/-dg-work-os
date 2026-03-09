-- ============================================================
-- Pending Applications Module (customer_applications)
-- Tracks customer service applications for GPL/GWI officers
-- NOTE: "pending_applications" name was taken by migration 030
--       (GPL service connections), so using "customer_applications"
-- ============================================================

-- 1. Main applications table
CREATE TABLE IF NOT EXISTS customer_applications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency            TEXT NOT NULL,
  applicant_name    TEXT NOT NULL,
  application_type  TEXT NOT NULL,
  reference_number  TEXT UNIQUE,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),
  priority          TEXT NOT NULL DEFAULT 'normal'
                      CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes             TEXT,
  created_by        UUID NOT NULL REFERENCES users(id),
  updated_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_applications_agency ON customer_applications(agency);
CREATE INDEX IF NOT EXISTS idx_customer_applications_status ON customer_applications(status);
CREATE INDEX IF NOT EXISTS idx_customer_applications_created_by ON customer_applications(created_by);
CREATE INDEX IF NOT EXISTS idx_customer_applications_submitted_at ON customer_applications(submitted_at DESC);

-- 2. Application documents
CREATE TABLE IF NOT EXISTS customer_application_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    UUID NOT NULL REFERENCES customer_applications(id) ON DELETE CASCADE,
  file_name         TEXT NOT NULL,
  file_url          TEXT NOT NULL,
  file_type         TEXT,
  file_size         BIGINT,
  uploaded_by       UUID NOT NULL REFERENCES users(id),
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_app_docs_app ON customer_application_documents(application_id);

-- 3. Activity log for applications
CREATE TABLE IF NOT EXISTS customer_application_activity_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    UUID NOT NULL REFERENCES customer_applications(id) ON DELETE CASCADE,
  action            TEXT NOT NULL,
  old_value         TEXT,
  new_value         TEXT,
  performed_by      UUID NOT NULL REFERENCES users(id),
  performed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  details           JSONB
);

CREATE INDEX IF NOT EXISTS idx_customer_app_activity_app ON customer_application_activity_log(application_id);
CREATE INDEX IF NOT EXISTS idx_customer_app_activity_at ON customer_application_activity_log(performed_at DESC);

-- 4. RLS policies
ALTER TABLE customer_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_application_activity_log ENABLE ROW LEVEL SECURITY;

-- DG gets full access
CREATE POLICY ca_dg_all ON customer_applications
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = (auth.jwt()->>'userId')::uuid AND role = 'dg')
  );

-- Agency-scoped SELECT/INSERT for staff
CREATE POLICY ca_agency_select ON customer_applications
  FOR SELECT TO authenticated
  USING (
    agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
  );

CREATE POLICY ca_agency_insert ON customer_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
  );

-- Agency users can update applications in their agency
CREATE POLICY ca_agency_update ON customer_applications
  FOR UPDATE TO authenticated
  USING (
    agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
  );

-- Documents: DG full access
CREATE POLICY cad_dg_all ON customer_application_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = (auth.jwt()->>'userId')::uuid AND role = 'dg')
  );

-- Documents: agency-scoped select
CREATE POLICY cad_agency_select ON customer_application_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customer_applications ca
      WHERE ca.id = application_id
        AND ca.agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
    )
  );

-- Documents: agency-scoped insert
CREATE POLICY cad_agency_insert ON customer_application_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM customer_applications ca
      WHERE ca.id = application_id
        AND ca.agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
    )
  );

-- Documents: delete own uploads only
CREATE POLICY cad_own_delete ON customer_application_documents
  FOR DELETE TO authenticated
  USING (uploaded_by = (auth.jwt()->>'userId')::uuid);

-- Activity log: DG full access
CREATE POLICY caal_dg_all ON customer_application_activity_log
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = (auth.jwt()->>'userId')::uuid AND role = 'dg')
  );

-- Activity log: agency-scoped select
CREATE POLICY caal_agency_select ON customer_application_activity_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customer_applications ca
      WHERE ca.id = application_id
        AND ca.agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
    )
  );

-- Activity log: insert for anyone taking action
CREATE POLICY caal_insert ON customer_application_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (performed_by = (auth.jwt()->>'userId')::uuid);

-- 5. Updated_at trigger
CREATE OR REPLACE FUNCTION update_customer_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customer_applications_updated_at
  BEFORE UPDATE ON customer_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_applications_updated_at();
