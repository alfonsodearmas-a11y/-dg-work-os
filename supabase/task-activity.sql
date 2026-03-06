CREATE TABLE IF NOT EXISTS task_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  -- e.g. 'created', 'moved_to_active', 'assigned_to', 'due_date_changed', 'commented'
  old_value   TEXT,
  new_value   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_activity_task_id_idx ON task_activity(task_id);
