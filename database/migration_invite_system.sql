-- Migration: Token-based invite system
-- Run against Supabase PostgreSQL

-- Ensure uuid-ossp extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add status column (replaces is_active for lifecycle tracking)
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'
  CHECK (status IN ('invited', 'active', 'disabled'));

-- Backfill: active users stay active, inactive become disabled
UPDATE users SET status = CASE WHEN is_active THEN 'active' ELSE 'disabled' END
  WHERE status IS NULL;

-- Make password_hash nullable (invited users don't have one yet)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Invite tokens table
CREATE TABLE IF NOT EXISTS invite_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('invite', 'password_reset')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_hash ON invite_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_user ON invite_tokens(user_id);
