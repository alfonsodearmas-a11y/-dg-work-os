-- ============================================================
-- Tender Match Review Reason (Procurement Audit Rebuild — Phase A)
--
-- Extends tender_match_review so rows can be queued for two distinct
-- reasons:
--   - ambiguous_match: fuzzy-match confidence 0.80–0.92 (existing behavior)
--   - ambiguous_stage: col J blank + no dates + valid description+method
--     (per user decision — see docs/procurement-audit-and-rebuild-plan.md §11-1)
-- ============================================================

ALTER TABLE tender_match_review
  ADD COLUMN IF NOT EXISTS review_reason TEXT NOT NULL DEFAULT 'ambiguous_match'
    CHECK (review_reason IN ('ambiguous_match', 'ambiguous_stage'));

CREATE INDEX IF NOT EXISTS idx_tender_match_review_reason_status
  ON tender_match_review (review_reason, status);
