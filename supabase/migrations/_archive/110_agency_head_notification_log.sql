-- ============================================================
-- Migration 110: agency_head_notification_log — fan-out audit
-- ============================================================
-- When a task is created with an agency, we additionally email the
-- agency head whose address lives in agency_psip_focal_point.agency_head_email.
-- That recipient may not have a Work OS user account, so the existing
-- `notifications` table (which is keyed on user_id) cannot log them.
-- This table captures every send attempt — including the no-op cases
-- where we deliberately did not send (blank email, dup of assignee).
-- ============================================================

CREATE TABLE IF NOT EXISTS agency_head_notification_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency          TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name  TEXT,
  task_id         UUID REFERENCES tasks(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL DEFAULT 'task_agency_head_notice',
  status          TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped_blank', 'skipped_dup_assignee')),
  error           TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_head_notif_log_agency_sent
  ON agency_head_notification_log(agency, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_agency_head_notif_log_task
  ON agency_head_notification_log(task_id);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE agency_head_notification_log ENABLE ROW LEVEL SECURITY;

-- SELECT: DG-or-above only (audit-tier data, includes external email addresses)
DROP POLICY IF EXISTS agency_head_notif_log_select ON agency_head_notification_log;
CREATE POLICY agency_head_notif_log_select ON agency_head_notification_log
  FOR SELECT TO authenticated
  USING (is_dg_or_above());

-- No INSERT/UPDATE/DELETE for authenticated users — server-only writes
DROP POLICY IF EXISTS agency_head_notif_log_service_all ON agency_head_notification_log;
CREATE POLICY agency_head_notif_log_service_all ON agency_head_notification_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE agency_head_notification_log IS
  'Append-only audit of agency-head email fan-out. Captures sent, failed, and skipped (blank / dup-of-assignee) cases so the audit trail explains why no email went out for an agency.';
