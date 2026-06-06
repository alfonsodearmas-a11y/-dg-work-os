-- ============================================================
-- Add NPTAB number to procurement packages
-- ============================================================

ALTER TABLE procurement_packages
  ADD COLUMN IF NOT EXISTS nptab_number TEXT;
