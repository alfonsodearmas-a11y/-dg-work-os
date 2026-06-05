-- ============================================================
-- Remove "draft" stage, rename "submitted" to "pre_advertisement"
-- Pipeline now: pre_advertisement → advertised → evaluation →
--               no_objection → awarded
-- ============================================================

-- 1. Migrate any existing rows at 'draft' or 'submitted' → 'pre_advertisement'
UPDATE procurement_packages
  SET current_stage = 'pre_advertisement'
  WHERE current_stage IN ('draft', 'submitted');

-- 2. Update stage history references
UPDATE procurement_stage_history
  SET from_stage = 'pre_advertisement'
  WHERE from_stage IN ('draft', 'submitted');

UPDATE procurement_stage_history
  SET to_stage = 'pre_advertisement'
  WHERE to_stage IN ('draft', 'submitted');

-- 3. Replace the CHECK constraint with the new stage set
ALTER TABLE procurement_packages
  DROP CONSTRAINT IF EXISTS procurement_packages_current_stage_check;

ALTER TABLE procurement_packages
  ADD CONSTRAINT procurement_packages_current_stage_check
    CHECK (current_stage IN (
      'pre_advertisement', 'advertised', 'evaluation',
      'no_objection', 'awarded'
    ));

-- 4. Set new default
ALTER TABLE procurement_packages
  ALTER COLUMN current_stage SET DEFAULT 'pre_advertisement';
