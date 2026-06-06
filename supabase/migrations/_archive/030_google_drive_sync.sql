-- Migration: Google Drive Sync for Document Vault
-- Run this manually in the Supabase SQL Editor

-- 1. Add Google Drive columns to documents table
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS google_drive_file_id TEXT,
  ADD COLUMN IF NOT EXISTS sync_source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

-- Unique constraint on google_drive_file_id (only one doc per Drive file)
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_google_drive_file_id
  ON documents (google_drive_file_id)
  WHERE google_drive_file_id IS NOT NULL;

-- Index for sync queries
CREATE INDEX IF NOT EXISTS idx_documents_sync_source
  ON documents (sync_source)
  WHERE sync_source IS NOT NULL;

-- 2. Create user_settings table for storing preferences (folder ID, last sync time, etc.)
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key)
);

-- RLS for user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own settings
CREATE POLICY user_settings_own ON user_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_user_key
  ON user_settings (user_id, key);

-- 3. RLS policies for new document columns (existing policies cover SELECT/DELETE already)
-- No additional RLS needed — existing documents policies already handle access control
-- The new columns (google_drive_file_id, sync_source, synced_at) are just metadata
