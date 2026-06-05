-- ============================================================
-- Tender Award Tracking (Procurement Audit Rebuild — Phase A)
--
-- Adds the two award-tracking columns the updated spec requires:
--   - awarded_at: ingest-observed timestamp, stamped the first time a
--     tender is seen at stage='award'. Never overwritten.
--   - first_appearance_already_awarded: true when the tender's first
--     ingest row already had stage='award' (unknown transition date).
--
-- Backfill for existing awarded rows: awarded_at = created_at, flag=true.
-- This is the honest treatment since we can't reconstruct true
-- transition dates. See docs/procurement-audit-and-rebuild-plan.md §7.1.
-- ============================================================

ALTER TABLE tender
  ADD COLUMN IF NOT EXISTS awarded_at                        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_appearance_already_awarded  BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tender_awarded_at
  ON tender (awarded_at DESC)
  WHERE awarded_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tender_active
  ON tender (agency, stage)
  WHERE stage <> 'award';

-- Backfill existing awarded rows.
UPDATE tender
   SET awarded_at = created_at,
       first_appearance_already_awarded = true
 WHERE stage = 'award'
   AND awarded_at IS NULL;
