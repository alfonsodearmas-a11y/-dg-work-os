CREATE TABLE IF NOT EXISTS subtasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID REFERENCES tasks(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  done        BOOLEAN DEFAULT false,
  position    INTEGER DEFAULT 0,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subtasks_task_id_idx ON subtasks(task_id);
