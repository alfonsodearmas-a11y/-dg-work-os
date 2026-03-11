-- ============================================================
-- DG Work OS -- Recurring Tasks
-- Adds recurrence support to task templates
-- Safe -- additive only
-- ============================================================

-- Add recurrence columns to task_templates
ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS
  recurrence_rule TEXT; -- 'daily' | 'weekly' | 'biweekly' | 'monthly'

ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS
  recurrence_enabled BOOLEAN DEFAULT false;

ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS
  recurrence_assignee_id UUID REFERENCES users(id);

ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS
  next_occurrence DATE;

ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS
  due_offset_days INTEGER DEFAULT 5;

-- Pre-configure the Weekly GPL Ops Review for weekly recurrence
UPDATE task_templates
SET recurrence_rule = 'weekly',
    due_offset_days = 4
WHERE name = 'Weekly GPL Ops Review';
