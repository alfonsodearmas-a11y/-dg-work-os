-- ============================================================
-- DG Work OS — People Admin Upgrade
-- Adds: suspended/archived status, archived_at, admin_audit_log
-- Run in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Widen status enum to include 'suspended' and 'archived'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('pending', 'active', 'inactive', 'suspended', 'archived'));

-- 2. Add archived_at column
ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- 3. Admin audit log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id        UUID REFERENCES users(id),
  target_user_id  UUID REFERENCES users(id),
  action          TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx ON admin_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log(created_at DESC);
