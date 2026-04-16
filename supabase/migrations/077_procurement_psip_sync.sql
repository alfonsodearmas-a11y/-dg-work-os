-- ============================================================
-- GWI PSIP Procurement Sync
-- Adds PSIP match key, milestone dates, remarks, and sync
-- timestamp to procurement_packages so updates from the 2026
-- PSIP sheet can flow into existing records.
-- ============================================================

ALTER TABLE procurement_packages
  ADD COLUMN IF NOT EXISTS psip_ref                    TEXT,
  ADD COLUMN IF NOT EXISTS date_first_advertised       DATE,
  ADD COLUMN IF NOT EXISTS tender_closing_date         DATE,
  ADD COLUMN IF NOT EXISTS date_eval_submitted_mtb     DATE,
  ADD COLUMN IF NOT EXISTS date_eval_submitted_nptab   DATE,
  ADD COLUMN IF NOT EXISTS date_of_award               DATE,
  ADD COLUMN IF NOT EXISTS psip_remarks                TEXT,
  ADD COLUMN IF NOT EXISTS psip_last_synced_at         TIMESTAMPTZ;

-- psip_ref is unique per agency when set; allows the same ref
-- number format across agencies without collision.
CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_packages_agency_psip_ref
  ON procurement_packages (agency, psip_ref)
  WHERE psip_ref IS NOT NULL;

-- Lookup index for the sync reader.
CREATE INDEX IF NOT EXISTS idx_procurement_packages_psip_ref
  ON procurement_packages (psip_ref)
  WHERE psip_ref IS NOT NULL;
