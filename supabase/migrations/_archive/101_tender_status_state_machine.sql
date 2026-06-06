-- ============================================================
-- Phase 2 D1: tender.status state machine + tender_status_decision ledger
--
-- Until Phase 1 the canonical signals were two flags:
--   missing_from_last_upload (boolean)
--   archived_at (nullable)
-- They could not represent intent. A tender absent from PSIP could be
-- a withdrawal, an agency error, a completed-outside-PSIP fact, or
-- noise — the flag did not say which. Phase 2 promotes status to a
-- proper state machine.
--
-- States:
--   active                    - the default; tracked normally
--   missing_pending_decision  - absent from latest upload AND not sticky-
--                               tracked; awaiting human decision in the
--                               procurement inbox
--   withdrawn                 - agency confirmed the procurement was
--                               cancelled or returned to general fund
--   completed_outside_psip    - implementation finished; PSIP no longer
--                               tracks (typical for awards moving to
--                               execution under another oversight track)
--   agency_error              - appeared in error in prior uploads;
--                               should not have been a tender
--   archived                  - final, DG-driven; hidden from every
--                               surface except /procurement/archived
--
-- Storage shape: tender.status is a stored TEXT column with CHECK
-- constraint. A trigger on tender_status_decision keeps it in sync. The
-- ledger is the audit trail; the column is the indexed lookup. List
-- queries filter by status='active' for cheap planning.
--
-- decision_id on the ledger references procurement_decision (the
-- universal R1 audit log) so a status transition is discoverable from
-- either side: drill from a procurement_decision row to its status
-- effect, or from a tender_status_decision row to the originating
-- decision (with actor + reason).
--
-- Conservative defaults this round (per Phase 2 scope):
--   * Hybrid stage authority rules are NOT IMPLEMENTED. Every absent
--     tender, regardless of stage, transitions to missing_pending_decision
--     on the first absence. Threshold tuning is gated on 4 weeks of
--     post-Phase-2 disappearance/reappearance data. See
--     audit/phase-2-shipped.md for the diagnostic queries that should
--     run at the four-week checkpoint to derive the rules.
--   * Per-agency threshold variation is NOT IMPLEMENTED. One absence
--     triggers the decision regardless of agency.
--   * Approval-gate UI is NOT IMPLEMENTED. The procurement_decision
--     approval columns (approval_state, approved_by, approved_at,
--     approval_role from migration 095) remain available; no flow uses
--     them yet.
-- ============================================================

-- 1. tender.status column with CHECK and partial indexes for the two
--    states that drive query plans (active board, missing inbox).
ALTER TABLE tender
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN (
    'active',
    'missing_pending_decision',
    'withdrawn',
    'completed_outside_psip',
    'agency_error',
    'archived'
  ));

CREATE INDEX IF NOT EXISTS idx_tender_status_active
  ON tender (agency, updated_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_tender_status_missing_pending
  ON tender (agency, updated_at DESC)
  WHERE status = 'missing_pending_decision';

-- 2. tender_status_decision ledger.
CREATE TABLE IF NOT EXISTS tender_status_decision (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id       UUID NOT NULL REFERENCES tender(id) ON DELETE CASCADE,
  status_before   TEXT CHECK (status_before IN (
    'active',
    'missing_pending_decision',
    'withdrawn',
    'completed_outside_psip',
    'agency_error',
    'archived'
  )),
  status_after    TEXT NOT NULL CHECK (status_after IN (
    'active',
    'missing_pending_decision',
    'withdrawn',
    'completed_outside_psip',
    'agency_error',
    'archived'
  )),
  reason_code     TEXT,
  decision_id     UUID REFERENCES procurement_decision(id) ON DELETE SET NULL,
  decided_by      UUID NOT NULL REFERENCES users(id),
  decided_role    TEXT NOT NULL,
  decided_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tender_status_decision_tender_time
  ON tender_status_decision (tender_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_tender_status_decision_after_time
  ON tender_status_decision (status_after, decided_at DESC);

ALTER TABLE tender_status_decision ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read tender_status_decision"
  ON tender_status_decision FOR SELECT TO authenticated USING (true);

CREATE POLICY "svc full tender_status_decision"
  ON tender_status_decision FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3. Trigger keeps tender.status in sync with the latest ledger row.
--    The column is the authoritative read; the ledger is the audit.
CREATE OR REPLACE FUNCTION sync_tender_status_from_decision()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tender SET status = NEW.status_after WHERE id = NEW.tender_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_tender_status_from_decision ON tender_status_decision;
CREATE TRIGGER trg_sync_tender_status_from_decision
  AFTER INSERT ON tender_status_decision
  FOR EACH ROW EXECUTE FUNCTION sync_tender_status_from_decision();

-- 4. Backfill: derive each tender's initial status from the Phase 1
--    flags and write one tender_status_decision row per tender. The
--    trigger then sets tender.status. Idempotent — the WHERE NOT EXISTS
--    skips tenders that already have a ledger entry.
INSERT INTO tender_status_decision (
  tender_id, status_before, status_after,
  reason_code, decided_by, decided_role
)
SELECT
  t.id,
  NULL AS status_before,
  CASE
    WHEN t.archived_at IS NOT NULL THEN 'archived'
    WHEN t.missing_from_last_upload = true
      AND t.keep_tracking_despite_missing = false
      THEN 'missing_pending_decision'
    ELSE 'active'
  END AS status_after,
  'backfill_phase_2_d1' AS reason_code,
  (SELECT id FROM users WHERE email = 'system@mpua.gov.gy' LIMIT 1),
  'system'
FROM tender t
WHERE NOT EXISTS (
  SELECT 1 FROM tender_status_decision tsd WHERE tsd.tender_id = t.id
);
