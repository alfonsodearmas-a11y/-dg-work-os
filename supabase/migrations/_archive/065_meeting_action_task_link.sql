-- Link meeting actions to tasks (idempotent — column may already exist from migration 027)
ALTER TABLE meeting_actions ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
