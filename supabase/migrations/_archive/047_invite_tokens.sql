-- Migration 047: Add invite token columns for self-service password setup
-- When a user is invited, a secure token is generated and emailed.
-- The user clicks the link to set their own password before first login.

ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token_expires_at TIMESTAMPTZ;

-- Index for fast token lookup (partial — only non-null tokens)
CREATE INDEX IF NOT EXISTS idx_users_invite_token
  ON users(invite_token)
  WHERE invite_token IS NOT NULL;
