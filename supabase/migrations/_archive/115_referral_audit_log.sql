-- Append-only audit log for every status transition and field update on
-- ministerial_referrals. Insert-only by service_role; no UPDATE/DELETE policy
-- for authenticated users.

CREATE TABLE IF NOT EXISTS referral_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id   UUID NOT NULL REFERENCES ministerial_referrals(id) ON DELETE CASCADE,
  changed_by    UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  field_changed TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_audit_log_referral_idx
  ON referral_audit_log(referral_id, timestamp DESC);

ALTER TABLE referral_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_service_role         ON referral_audit_log;
DROP POLICY IF EXISTS audit_authenticated_select ON referral_audit_log;

CREATE POLICY audit_service_role
  ON referral_audit_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY audit_authenticated_select
  ON referral_audit_log FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE referral_audit_log IS
  'Append-only audit trail. field_changed is the column name, or the virtual key '
  '''status_transition'' for state moves. For manual status overrides, new_value '
  'is formatted as ''<new_state>|reason=<text>'' to preserve the operator reason.';
