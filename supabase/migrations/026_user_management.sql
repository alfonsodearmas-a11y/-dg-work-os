-- ============================================================
-- DG Work OS — User Management Enhancements
-- Run this in Supabase dashboard > SQL Editor
-- Safe to run against existing project — only adds columns
-- ============================================================

-- 1. Allow google_sub to be NULL for pre-registered (invited) users
--    who haven't signed in yet. google_sub is filled on first sign-in.
ALTER TABLE users ALTER COLUMN google_sub DROP NOT NULL;

-- 2. Add new tracking columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
  CHECK (status IN ('pending', 'active', 'inactive'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;

-- 3. Set existing users to 'active' status (they've already been signing in)
UPDATE users SET status = 'active' WHERE status IS NULL;

-- 4. Backfill first_login_at and last_seen_at from last_login for existing users
UPDATE users SET
  first_login_at = COALESCE(first_login_at, last_login),
  last_seen_at = COALESCE(last_seen_at, last_login),
  login_count = COALESCE(login_count, 1)
WHERE last_login IS NOT NULL AND first_login_at IS NULL;

-- 5. Index for fast email lookups (used on every sign-in whitelist check)
CREATE INDEX IF NOT EXISTS users_email_active_idx ON users(email) WHERE is_active = true;

-- 6. Relax agency constraint so invited users without agency can be created
--    (officers can exist without agency until admin assigns one)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_agency_check;
ALTER TABLE users ADD CONSTRAINT users_agency_check
  CHECK (
    role != 'agency_admin' OR agency IS NOT NULL
  );
