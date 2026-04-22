-- ============================================================
-- psip_nag_record — per-(agency, tender) nag state
--
-- consecutive_weekly_count increments only on weekly cron runs where
-- the tender is STILL missing the required PSIP date. It resets when
-- the date is filled (resolved_at stamped) OR when the tender exits
-- the missing set for any reason (stage transition, rollover flag,
-- removal from PSIP).
--
-- At consecutive_weekly_count >= 3 the weekly digest adds the agency
-- head to TO on that week's email; subsequent weeks stay flagged but
-- do not re-alert the head (see cron compose logic).
-- ============================================================

CREATE TABLE IF NOT EXISTS psip_nag_record (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency                     TEXT NOT NULL,
  tender_id                  UUID NOT NULL REFERENCES tender(id) ON DELETE CASCADE,
  trigger_kind               TEXT NOT NULL,  -- 'weekly' | 'event_new_critical' | 'escalation'
  consecutive_weekly_count   INTEGER NOT NULL DEFAULT 0,
  first_nagged_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_nagged_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at                TIMESTAMPTZ,
  UNIQUE (agency, tender_id)
);

CREATE INDEX IF NOT EXISTS idx_psip_nag_record_agency_active
  ON psip_nag_record (agency, last_nagged_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE psip_nag_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read psip_nag_record"
  ON psip_nag_record FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full psip_nag_record"
  ON psip_nag_record FOR ALL TO service_role USING (true) WITH CHECK (true);
