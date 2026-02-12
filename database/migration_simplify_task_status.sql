-- ============================================
-- SIMPLIFY TASK STATUS SYSTEM
-- From 7 statuses to 4: new, in_progress, delayed, done
-- ============================================

-- 1. Add new enum values
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'new';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'delayed';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'done';

-- 2. Migrate existing tasks to new statuses
UPDATE tasks SET status = 'new' WHERE status IN ('assigned', 'acknowledged');
UPDATE tasks SET status = 'delayed' WHERE status = 'overdue';
UPDATE tasks SET status = 'done' WHERE status = 'verified';
UPDATE tasks SET status = 'in_progress' WHERE status IN ('submitted', 'rejected');

-- 3. Update default
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'new';

-- NOTE: PostgreSQL doesn't support removing enum values.
-- Old values (assigned, acknowledged, submitted, verified, rejected, overdue) remain in the enum
-- but will never be written again. Code enforces the 4-status model.
