-- ============================================================
-- Tender: track created_by for manual tenders
--
-- Manual tenders (source='manual') need a user id so the UI can
-- enforce "editable by creator" rules. PSIP-sourced rows have no
-- human author and keep created_by = NULL.
-- ============================================================

ALTER TABLE tender
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_tender_created_by
  ON tender (created_by)
  WHERE created_by IS NOT NULL;
