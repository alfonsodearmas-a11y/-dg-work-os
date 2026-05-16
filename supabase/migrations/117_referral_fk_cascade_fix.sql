-- Fix FK cascade contradiction on referral_audit_log.changed_by.
-- Original (115): NOT NULL REFERENCES users(id) ON DELETE SET NULL
-- Contradiction: SET NULL cannot satisfy NOT NULL when the referenced user is deleted.
-- Fix: switch to RESTRICT so user deletion is blocked while audit rows reference them.
--
-- Note: referred_by on ministerial_referrals was already declared ON DELETE RESTRICT
-- in migration 114; no change needed there. referral_audit_log.referral_id stays
-- ON DELETE CASCADE because audit rows are owned by the referral row.

ALTER TABLE referral_audit_log
  DROP CONSTRAINT IF EXISTS referral_audit_log_changed_by_fkey;

ALTER TABLE referral_audit_log
  ADD CONSTRAINT referral_audit_log_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT;
