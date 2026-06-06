-- ============================================================
-- Procurement Tracking Module
-- Kanban pipeline: Submitted → Advertised → Evaluation →
--                  No-objection → Awarded
-- Every stage transition is timestamped (procurement clock).
-- ============================================================

-- 1. Main packages table
CREATE TABLE IF NOT EXISTS procurement_packages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency                TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT,
  estimated_value       NUMERIC NOT NULL,
  procurement_method    TEXT NOT NULL
                          CHECK (procurement_method IN (
                            'open_tender', 'selective_tender',
                            'sole_source', 'request_for_quotation'
                          )),
  current_stage         TEXT NOT NULL DEFAULT 'submitted'
                          CHECK (current_stage IN (
                            'submitted', 'advertised', 'evaluation',
                            'no_objection', 'awarded'
                          )),
  submitted_by          UUID NOT NULL REFERENCES users(id),
  oversight_project_id  UUID REFERENCES projects(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_packages_agency ON procurement_packages(agency);
CREATE INDEX IF NOT EXISTS idx_procurement_packages_stage ON procurement_packages(current_stage);
CREATE INDEX IF NOT EXISTS idx_procurement_packages_submitted_by ON procurement_packages(submitted_by);
CREATE INDEX IF NOT EXISTS idx_procurement_packages_created_at ON procurement_packages(created_at DESC);

-- 2. Stage history — the procurement clock
CREATE TABLE IF NOT EXISTS procurement_stage_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id  UUID NOT NULL REFERENCES procurement_packages(id) ON DELETE CASCADE,
  from_stage  TEXT,
  to_stage    TEXT NOT NULL,
  changed_by  UUID NOT NULL REFERENCES users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_procurement_stage_history_package ON procurement_stage_history(package_id);
CREATE INDEX IF NOT EXISTS idx_procurement_stage_history_changed_at ON procurement_stage_history(changed_at DESC);

-- 3. Documents attached to packages
CREATE TABLE IF NOT EXISTS procurement_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id  UUID NOT NULL REFERENCES procurement_packages(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  file_type   TEXT,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_documents_package ON procurement_documents(package_id);

-- 4. Notes — immutable logbook (matches customer_application_notes pattern)
CREATE TABLE IF NOT EXISTS procurement_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id  UUID NOT NULL REFERENCES procurement_packages(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_notes_package ON procurement_notes(package_id);
CREATE INDEX IF NOT EXISTS idx_procurement_notes_created_at ON procurement_notes(created_at DESC);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE procurement_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_notes ENABLE ROW LEVEL SECURITY;

-- ---- procurement_packages ----

-- DG/Minister/PS: SELECT all packages across all agencies
CREATE POLICY pp_ministry_select ON procurement_packages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role IN ('dg', 'minister', 'ps')
    )
  );

-- DG: full write (fallback for admin fixes)
CREATE POLICY pp_dg_all ON procurement_packages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role = 'dg'
    )
  );

-- Agency staff: SELECT own agency
CREATE POLICY pp_agency_select ON procurement_packages
  FOR SELECT TO authenticated
  USING (
    agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
  );

-- Agency staff: INSERT for own agency
CREATE POLICY pp_agency_insert ON procurement_packages
  FOR INSERT TO authenticated
  WITH CHECK (
    agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
  );

-- Agency staff: UPDATE own agency packages (advance stages)
CREATE POLICY pp_agency_update ON procurement_packages
  FOR UPDATE TO authenticated
  USING (
    agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
  );

-- ---- procurement_stage_history ----

-- DG/Minister/PS: SELECT all history
CREATE POLICY psh_ministry_select ON procurement_stage_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role IN ('dg', 'minister', 'ps')
    )
  );

-- DG: full access
CREATE POLICY psh_dg_all ON procurement_stage_history
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role = 'dg'
    )
  );

-- Agency staff: SELECT history for own agency's packages
CREATE POLICY psh_agency_select ON procurement_stage_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM procurement_packages p
      WHERE p.id = package_id
        AND p.agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
    )
  );

-- Agency staff: INSERT history for own agency's packages
CREATE POLICY psh_agency_insert ON procurement_stage_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurement_packages p
      WHERE p.id = package_id
        AND p.agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
    )
  );

-- ---- procurement_documents ----

-- DG/Minister/PS: SELECT all documents
CREATE POLICY pd_ministry_select ON procurement_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role IN ('dg', 'minister', 'ps')
    )
  );

-- DG: full access
CREATE POLICY pd_dg_all ON procurement_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role = 'dg'
    )
  );

-- Agency staff: SELECT documents for own agency's packages
CREATE POLICY pd_agency_select ON procurement_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM procurement_packages p
      WHERE p.id = package_id
        AND p.agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
    )
  );

-- Agency staff: INSERT documents for own agency's packages
CREATE POLICY pd_agency_insert ON procurement_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurement_packages p
      WHERE p.id = package_id
        AND p.agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
    )
  );

-- Agency staff: DELETE own uploads only
CREATE POLICY pd_own_delete ON procurement_documents
  FOR DELETE TO authenticated
  USING (uploaded_by = (auth.jwt()->>'userId')::uuid);

-- ---- procurement_notes ----

-- DG/Minister/PS: SELECT all notes
CREATE POLICY pn_ministry_select ON procurement_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role IN ('dg', 'minister', 'ps')
    )
  );

-- DG: full access
CREATE POLICY pn_dg_all ON procurement_notes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role = 'dg'
    )
  );

-- Agency staff: SELECT notes for own agency's packages
CREATE POLICY pn_agency_select ON procurement_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM procurement_packages p
      WHERE p.id = package_id
        AND p.agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
    )
  );

-- Agency staff: INSERT notes for own agency's packages
CREATE POLICY pn_agency_insert ON procurement_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM procurement_packages p
      WHERE p.id = package_id
        AND p.agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
    )
  );

-- No UPDATE or DELETE on notes — immutable logbook pattern

-- ============================================================
-- updated_at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_procurement_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_procurement_packages_updated_at
  BEFORE UPDATE ON procurement_packages
  FOR EACH ROW
  EXECUTE FUNCTION update_procurement_packages_updated_at();

-- ============================================================
-- Storage bucket for procurement documents
-- ============================================================
-- NOTE: Run via Supabase dashboard or CLI:
--   supabase storage create procurement-documents
-- Path convention: {agency}/{package_id}/{file_name}
