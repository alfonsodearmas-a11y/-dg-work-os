-- ============================================================
-- Sticky Resurrect — keep_tracking_despite_missing
--
-- Pre-R4 Resurrect was logically empty: the user clicked Resurrect, the
-- missing flag flipped to false, and the next upload that still didn't
-- contain the tender flipped it right back. The resurrect decision had
-- nowhere to live, so it could not stick.
--
-- R4 introduces a sticky flag the matcher consults. When set, the apply
-- phase suppresses the auto-flip-to-missing for that tender on subsequent
-- uploads where it is again absent. The user has explicitly asserted
-- "keep tracking this; PSIP doesn't see it but it is still real."
--
-- Resurrect now sets keep_tracking_despite_missing=true. Revoke (DG only,
-- on the tender detail view) sets it back to false. Both write a
-- procurement_decision row.
--
-- The dedicated /procurement/missing queue continues to surface tenders
-- where missing_from_last_upload=true AND keep_tracking_despite_missing=false
-- — sticky-tracked ones drop out of the queue once Resurrect ticks.
-- ============================================================

ALTER TABLE tender
  ADD COLUMN IF NOT EXISTS keep_tracking_despite_missing BOOLEAN NOT NULL DEFAULT false;

-- Sparse index: only the rare tenders where the user has asserted sticky
-- tracking. Most tenders never set this; the partial WHERE keeps the
-- index small.
CREATE INDEX IF NOT EXISTS idx_tender_keep_tracking
  ON tender (agency, updated_at DESC)
  WHERE keep_tracking_despite_missing = true;
