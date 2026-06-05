-- Notification system V2: expand types, add categories, metadata, action tracking

-- Drop rigid CHECK constraint on type (currently limits to 8 values)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Drop rigid CHECK constraint on reference_type
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_reference_type_check;

-- Add new columns
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS source_module TEXT DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS action_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS action_type TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing rows
UPDATE notifications SET category = 'meetings', source_module = 'calendar' WHERE type LIKE 'meeting_%';
UPDATE notifications SET category = 'tasks', source_module = 'notion' WHERE type LIKE 'task_%';

-- New indexes for category/action filtering
CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(user_id, category) WHERE dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_action ON notifications(user_id, action_required) WHERE action_required = TRUE AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_expires ON notifications(expires_at) WHERE expires_at IS NOT NULL;

-- Add preference columns for new categories
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS projects_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS kpi_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS oversight_enabled BOOLEAN DEFAULT TRUE;
