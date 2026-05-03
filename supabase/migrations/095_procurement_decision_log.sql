-- ============================================================
-- procurement_decision — universal decision ledger
--
-- Every queue action across the procurement reconciliation surfaces
-- (Archive, Resurrect, Skip, Permanent-Ignore, Match, Create-from-review,
-- Assign-stage, and Phase 2 status transitions) writes one row here.
-- This is the single audit trail consulted by the Decisions surface
-- and the substrate for the Phase 3 approval-gate flow.
--
-- Asymmetry, by design:
--   * decision_type is a CHECK-constrained closed vocabulary. Adding a new
--     decision verb is a structural change to the system and warrants a
--     migration so every consumer (UI, audit views, future approval gates)
--     can be updated coherently.
--   * reason_code is free TEXT. Reason vocabularies are descriptive and
--     differ per decision_type (skip codes, archive codes, match codes).
--     Enforcing them in SQL would make every vocabulary tweak a migration.
--     The application layer is the single writer (service_role only) and
--     owns these vocabularies in code.
--
-- agency is denormalized at write time. Multi-role queries (agency_admin
-- scoping, Activity Feed filtering) are agency-scoped by default, and the
-- feed is store-forever. Pay the denormalization cost while empty.
--
-- approval_state defaults to 'none' in Phase 1; the proposed/approved
-- columns stay NULL until the Phase 3 approval-gate flow lands.
-- ============================================================

CREATE TABLE IF NOT EXISTS procurement_decision (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  decision_type   TEXT NOT NULL
    CHECK (decision_type IN (
      'archive', 'unarchive',
      'resurrect', 'revoke_tracking',
      'skip', 'permanent_ignore',
      'match', 'create_from_review', 'assign_stage',
      'status_change'
    )),

  target_kind     TEXT NOT NULL
    CHECK (target_kind IN ('tender', 'review_row')),
  target_id       UUID NOT NULL,

  agency          TEXT NOT NULL,

  actor_id        UUID NOT NULL REFERENCES users(id),
  actor_role      TEXT NOT NULL,

  reason_code     TEXT,
  reason_text     TEXT,

  decided_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  approval_state  TEXT NOT NULL DEFAULT 'none'
    CHECK (approval_state IN ('none', 'proposed', 'approved', 'rejected')),
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  approval_role   TEXT
);

CREATE INDEX IF NOT EXISTS idx_procurement_decision_target
  ON procurement_decision (target_kind, target_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_procurement_decision_agency_time
  ON procurement_decision (agency, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_procurement_decision_actor_time
  ON procurement_decision (actor_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_procurement_decision_type_time
  ON procurement_decision (decision_type, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_procurement_decision_pending_approval
  ON procurement_decision (approval_state, decided_at DESC)
  WHERE approval_state = 'proposed';

ALTER TABLE procurement_decision ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read procurement_decision"
  ON procurement_decision FOR SELECT TO authenticated USING (true);

CREATE POLICY "svc full procurement_decision"
  ON procurement_decision FOR ALL TO service_role
  USING (true) WITH CHECK (true);
