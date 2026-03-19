-- ============================================================
-- Add "draft" stage + expected_delivery_date to procurement
-- ============================================================

-- 1. Widen the current_stage CHECK to include 'draft'
ALTER TABLE procurement_packages
  DROP CONSTRAINT IF EXISTS procurement_packages_current_stage_check;

ALTER TABLE procurement_packages
  ADD CONSTRAINT procurement_packages_current_stage_check
    CHECK (current_stage IN (
      'draft', 'submitted', 'advertised', 'evaluation',
      'no_objection', 'awarded'
    ));

-- 2. Change the default for new rows to 'draft'
ALTER TABLE procurement_packages
  ALTER COLUMN current_stage SET DEFAULT 'draft';

-- 3. Add expected delivery date
ALTER TABLE procurement_packages
  ADD COLUMN IF NOT EXISTS expected_delivery_date DATE;
