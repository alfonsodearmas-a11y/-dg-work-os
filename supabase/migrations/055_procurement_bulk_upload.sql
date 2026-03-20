-- ============================================================
-- Procurement Bulk Upload Support
-- Adds procurement_import_batches table and new columns on
-- procurement_packages for deduplication and traceability.
-- ============================================================

-- 1. Import batches — one row per bulk upload
CREATE TABLE IF NOT EXISTS procurement_import_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency      TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  file_name   TEXT NOT NULL,
  row_count   INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'completed'
                CHECK (status IN ('completed', 'rolled_back')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_import_batches_agency ON procurement_import_batches(agency);
CREATE INDEX IF NOT EXISTS idx_procurement_import_batches_created_at ON procurement_import_batches(created_at DESC);

-- 2. New columns on procurement_packages
ALTER TABLE procurement_packages
  ADD COLUMN IF NOT EXISTS bid_reference    TEXT,
  ADD COLUMN IF NOT EXISTS tender_board     TEXT,
  ADD COLUMN IF NOT EXISTS opening_date     DATE,
  ADD COLUMN IF NOT EXISTS import_batch_id  UUID REFERENCES procurement_import_batches(id) ON DELETE SET NULL;

-- Composite index for deduplication lookups during import (agency first for typical WHERE agency=$1 AND bid_reference=$2)
CREATE INDEX IF NOT EXISTS idx_procurement_packages_agency_bid_ref
  ON procurement_packages(agency, bid_reference)
  WHERE bid_reference IS NOT NULL;

-- Index on FK for batch rollback queries
CREATE INDEX IF NOT EXISTS idx_procurement_packages_import_batch_id
  ON procurement_packages(import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- ============================================================
-- RLS Policies — procurement_import_batches
-- Follows same pattern as procurement_packages (052)
-- ============================================================

ALTER TABLE procurement_import_batches ENABLE ROW LEVEL SECURITY;

-- DG/Minister/PS: SELECT all batches
CREATE POLICY pib_ministry_select ON procurement_import_batches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role IN ('dg', 'minister', 'ps')
    )
  );

-- DG: full access
CREATE POLICY pib_dg_all ON procurement_import_batches
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role = 'dg'
    )
  );

-- Agency staff: SELECT batches for own agency
CREATE POLICY pib_agency_select ON procurement_import_batches
  FOR SELECT TO authenticated
  USING (
    agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
  );

-- Agency staff: INSERT batches for own agency
CREATE POLICY pib_agency_insert ON procurement_import_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
  );

-- Agency staff: UPDATE batches for own agency (e.g. mark as rolled_back)
CREATE POLICY pib_agency_update ON procurement_import_batches
  FOR UPDATE TO authenticated
  USING (
    agency = (SELECT agency FROM users WHERE id = (auth.jwt()->>'userId')::uuid)
  );
