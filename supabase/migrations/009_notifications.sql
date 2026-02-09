-- Notification system tables

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'dg',
  type TEXT NOT NULL CHECK (type IN (
    'meeting_reminder_24h', 'meeting_reminder_1h', 'meeting_reminder_15m',
    'meeting_starting', 'meeting_minutes_ready',
    'task_due_tomorrow', 'task_due_today', 'task_overdue'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  icon TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  reference_type TEXT CHECK (reference_type IN ('meeting','task')),
  reference_id TEXT,
  reference_url TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  push_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_scheduled ON notifications(user_id, scheduled_for DESC);
CREATE INDEX idx_notifications_dedup ON notifications(type, reference_id, scheduled_for);

-- Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- User notification preferences
CREATE TABLE notification_preferences (
  user_id TEXT PRIMARY KEY DEFAULT 'dg',
  meeting_reminder_24h BOOLEAN DEFAULT TRUE,
  meeting_reminder_1h BOOLEAN DEFAULT TRUE,
  meeting_reminder_15m BOOLEAN DEFAULT TRUE,
  task_due_reminders BOOLEAN DEFAULT TRUE,
  task_overdue_alerts BOOLEAN DEFAULT TRUE,
  meeting_minutes_ready BOOLEAN DEFAULT TRUE,
  do_not_disturb BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default DG preferences
INSERT INTO notification_preferences (user_id) VALUES ('dg');
