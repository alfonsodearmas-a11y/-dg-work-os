-- ============================================================
-- Migration 125: agency_scheduled_reports + audit columns
-- ============================================================
-- Two changes:
--
-- 1. Adds `source` and `template` columns to agency_intel_reports so the
--    POST rate-limit query can filter to manual sends (scheduled-source
--    rows from the cron handler do not consume a user's hourly budget).
--    Existing rows backfill to source='manual', template='editorial' so
--    historical audit attribution stays meaningful.
--
-- 2. Creates agency_scheduled_reports for recurring email sends. The cron
--    handler (app/api/cron/agency-scheduled-reports/route.ts) claims due
--    rows by conditionally advancing next_run_at before sending, so a
--    crash between send and bookkeeping leaves the schedule to self-heal
--    on its next occurrence rather than double-sending.
--
-- Manual execution only. Do not auto-apply.
-- ============================================================

-- ── 1. Audit columns ─────────────────────────────────────────
ALTER TABLE agency_intel_reports
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'scheduled'));

ALTER TABLE agency_intel_reports
  ADD COLUMN IF NOT EXISTS template TEXT NOT NULL DEFAULT 'plain'
    CHECK (template IN ('plain', 'editorial'));

-- Existing rows predate the plain renderer; mark them editorial so the
-- audit log reflects what was actually sent. New rows default to plain.
UPDATE agency_intel_reports SET template = 'editorial' WHERE template = 'plain';
ALTER TABLE agency_intel_reports ALTER COLUMN template SET DEFAULT 'plain';

CREATE INDEX IF NOT EXISTS idx_agency_intel_reports_user_source_sent
  ON agency_intel_reports (sent_by_user_id, source, sent_at DESC);

-- ── 2. agency_scheduled_reports ──────────────────────────────
CREATE TABLE IF NOT EXISTS agency_scheduled_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  agency              TEXT NOT NULL,
  recipients          TEXT[] NOT NULL CHECK (cardinality(recipients) > 0),
  cover_message       TEXT,
  frequency           TEXT NOT NULL
    CHECK (frequency IN ('weekly', 'fortnightly', 'monthly')),
  day_of_week         INT CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month        INT CHECK (day_of_month BETWEEN 1 AND 28),
  send_hour           INT NOT NULL DEFAULT 8
    CHECK (send_hour BETWEEN 0 AND 23),
  timezone            TEXT NOT NULL DEFAULT 'America/Guyana',
  template            TEXT NOT NULL DEFAULT 'plain'
    CHECK (template IN ('plain', 'editorial')),
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  next_run_at         TIMESTAMPTZ NOT NULL,
  last_run_at         TIMESTAMPTZ,
  last_error          TEXT,
  last_error_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Frequency-specific day fields. weekly/fortnightly use day_of_week
  -- (day_of_month MUST be null); monthly uses day_of_month (day_of_week
  -- MUST be null). Mutual exclusivity keeps the row coherent so readers
  -- and future migrations cannot drift on stale data.
  CONSTRAINT agency_scheduled_reports_freq_fields_chk CHECK (
    (
      frequency IN ('weekly', 'fortnightly')
      AND day_of_week IS NOT NULL
      AND day_of_month IS NULL
    )
    OR (
      frequency = 'monthly'
      AND day_of_month IS NOT NULL
      AND day_of_week IS NULL
    )
  )
);

-- The cron handler reads this index on every tick.
CREATE INDEX IF NOT EXISTS idx_agency_scheduled_reports_active_next_run
  ON agency_scheduled_reports (active, next_run_at)
  WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_agency_scheduled_reports_agency
  ON agency_scheduled_reports (agency);

CREATE INDEX IF NOT EXISTS idx_agency_scheduled_reports_created_by
  ON agency_scheduled_reports (created_by_user_id);

-- ── 3. RLS ───────────────────────────────────────────────────
ALTER TABLE agency_scheduled_reports ENABLE ROW LEVEL SECURITY;

-- SELECT: creator, DG/Minister/PS (audit visibility), or agency staff
-- assigned to this agency.
DROP POLICY IF EXISTS agency_scheduled_reports_select ON agency_scheduled_reports;
CREATE POLICY agency_scheduled_reports_select ON agency_scheduled_reports
  FOR SELECT TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR is_dg_or_above()
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('agency_admin', 'officer')
        AND UPPER(u.agency) = UPPER(agency_scheduled_reports.agency)
    )
  );

DROP POLICY IF EXISTS agency_scheduled_reports_insert ON agency_scheduled_reports;
CREATE POLICY agency_scheduled_reports_insert ON agency_scheduled_reports
  FOR INSERT TO authenticated
  WITH CHECK (created_by_user_id = auth.uid());

DROP POLICY IF EXISTS agency_scheduled_reports_update ON agency_scheduled_reports;
CREATE POLICY agency_scheduled_reports_update ON agency_scheduled_reports
  FOR UPDATE TO authenticated
  USING (created_by_user_id = auth.uid() OR is_dg_or_above())
  WITH CHECK (created_by_user_id = auth.uid() OR is_dg_or_above());

DROP POLICY IF EXISTS agency_scheduled_reports_delete ON agency_scheduled_reports;
CREATE POLICY agency_scheduled_reports_delete ON agency_scheduled_reports
  FOR DELETE TO authenticated
  USING (created_by_user_id = auth.uid() OR is_dg_or_above());

DROP POLICY IF EXISTS agency_scheduled_reports_service_all ON agency_scheduled_reports;
CREATE POLICY agency_scheduled_reports_service_all ON agency_scheduled_reports
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- ── 4. updated_at trigger ────────────────────────────────────
CREATE OR REPLACE FUNCTION agency_scheduled_reports_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_scheduled_reports_updated_at
  ON agency_scheduled_reports;
CREATE TRIGGER trg_agency_scheduled_reports_updated_at
  BEFORE UPDATE ON agency_scheduled_reports
  FOR EACH ROW
  EXECUTE FUNCTION agency_scheduled_reports_set_updated_at();

-- ── 5. Comments ──────────────────────────────────────────────
COMMENT ON TABLE agency_scheduled_reports IS
  'Recurring Agency Intel Report email schedules. The cron handler claims due rows by conditionally advancing next_run_at before sending; a failed send leaves a skipped occurrence rather than risking a double-send.';

COMMENT ON COLUMN agency_scheduled_reports.created_by_user_id IS
  'NULL when the creator has been deactivated. The cron handler resolves attribution to the active DG at run time so institutional schedules outlive their creators.';

COMMENT ON COLUMN agency_intel_reports.source IS
  'manual = interactive POST from a user; scheduled = cron-triggered send. The rate limit query filters to manual.';
