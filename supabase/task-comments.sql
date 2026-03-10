-- task_comments: threaded comments on tasks
-- NOTE: Table was originally created from the TM migration (migration_task_management.sql)
-- but without FK constraints to the Supabase users/tasks tables.
-- Run the ALTER statements below to add missing FKs.

CREATE TABLE IF NOT EXISTS task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  parent_id   UUID REFERENCES task_comments(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_comments_task_id_idx ON task_comments(task_id);

-- Add missing FK constraints if table already exists without them
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'task_comments' AND constraint_name = 'task_comments_task_id_fkey'
  ) THEN
    ALTER TABLE task_comments ADD CONSTRAINT task_comments_task_id_fkey
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'task_comments' AND constraint_name = 'task_comments_user_id_fkey'
  ) THEN
    ALTER TABLE task_comments ADD CONSTRAINT task_comments_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'task_comments' AND constraint_name = 'task_comments_parent_id_fkey'
  ) THEN
    ALTER TABLE task_comments ADD CONSTRAINT task_comments_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES task_comments(id);
  END IF;
END
$$;
