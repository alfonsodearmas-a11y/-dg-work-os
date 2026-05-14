-- ============================================================
-- Migration 109: agency_intel_reports — audit log for PDF exports
-- ============================================================
-- Every "Generate Report" action on an /intel/[agency] page produces
-- a PDF that is emailed to caller-specified recipients. This table
-- logs who sent what, where, when. Doubles as the rate-limit primitive
-- (10 sends per user per hour enforced via COUNT against this table).
-- ============================================================

CREATE TABLE IF NOT EXISTS agency_intel_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  agency          TEXT NOT NULL,
  recipients      TEXT[] NOT NULL,
  message         TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_intel_reports_user_sent
  ON agency_intel_reports(sent_by_user_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_agency_intel_reports_agency_sent
  ON agency_intel_reports(agency, sent_at DESC);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE agency_intel_reports ENABLE ROW LEVEL SECURITY;

-- SELECT: the sender, or DG-or-above (for audit visibility)
DROP POLICY IF EXISTS agency_intel_reports_select ON agency_intel_reports;
CREATE POLICY agency_intel_reports_select ON agency_intel_reports
  FOR SELECT TO authenticated
  USING (
    sent_by_user_id = auth.uid()
    OR is_dg_or_above()
  );

-- INSERT: any authenticated user can log their own send
DROP POLICY IF EXISTS agency_intel_reports_insert ON agency_intel_reports;
CREATE POLICY agency_intel_reports_insert ON agency_intel_reports
  FOR INSERT TO authenticated
  WITH CHECK (sent_by_user_id = auth.uid());

-- No UPDATE / DELETE — append-only audit log
DROP POLICY IF EXISTS agency_intel_reports_service_all ON agency_intel_reports;
CREATE POLICY agency_intel_reports_service_all ON agency_intel_reports
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE agency_intel_reports IS
  'Audit log for Agency Intel PDF report exports. Also used as the rate-limit primitive (10/hr/user via COUNT WHERE sent_at > NOW() - INTERVAL ''1 hour'').';
