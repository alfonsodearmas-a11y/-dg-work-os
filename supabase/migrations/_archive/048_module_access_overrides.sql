-- ============================================================
-- Module Access Overrides
-- Extends user_module_access to support both explicit grants AND
-- explicit denials (revoking default role access).
--
-- access_type = 'grant' → user gets access beyond their role default
-- access_type = 'deny'  → user loses access despite their role default
--
-- If no override row exists, the module falls back to role defaults.
-- ============================================================

-- 1. Add access_type column with default 'grant' (backward compatible)
ALTER TABLE user_module_access
  ADD COLUMN IF NOT EXISTS access_type TEXT NOT NULL DEFAULT 'grant'
  CHECK (access_type IN ('grant', 'deny'));

-- 2. Add updated_at column for tracking when overrides were last changed
ALTER TABLE user_module_access
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
