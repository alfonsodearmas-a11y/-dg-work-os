-- ============================================================
-- DG Work OS — Task Management Upgrade
-- Run in Supabase dashboard > SQL Editor
-- Safe — additive only, no drops or renames
-- ============================================================

-- 1. Add blocked_reason column
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS
  blocked_reason TEXT;

-- 2. Add completed_at timestamp
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS
  completed_at TIMESTAMPTZ;

-- 3. Widen status constraint to accept both old and new values
--    (so the migration below doesn't violate constraints)
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('not_started', 'in_progress', 'completed', 'blocked',
                    'new', 'active', 'done'));

-- 4. Widen priority constraint to accept both old and new values
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'urgent', 'critical'));

-- 5. Task templates table
CREATE TABLE IF NOT EXISTS task_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  agency_slug TEXT,
  priority    TEXT DEFAULT 'medium',
  checklist   JSONB,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 6. Seed templates
INSERT INTO task_templates (name, description, agency_slug, priority, checklist) VALUES
(
  'Board Meeting Prep',
  'Standard preparation checklist for GWI/UG/NCN board meetings',
  null,
  'high',
  '[
    {"label": "Request agenda from secretariat", "done": false},
    {"label": "Pull financials and KPI reports", "done": false},
    {"label": "Review previous meeting minutes", "done": false},
    {"label": "Prepare DG briefing note", "done": false},
    {"label": "Confirm attendance and quorum", "done": false}
  ]'::jsonb
),
(
  'Site Visit',
  'Pre and post checklist for agency site visits',
  null,
  'medium',
  '[
    {"label": "Brief agency head in advance", "done": false},
    {"label": "Review recent incident and KPI reports", "done": false},
    {"label": "Prepare list of issues to inspect", "done": false},
    {"label": "Document findings on site", "done": false},
    {"label": "Issue follow-up action items within 48h", "done": false}
  ]'::jsonb
),
(
  'Procurement Review',
  'Contract and procurement review checklist',
  null,
  'high',
  '[
    {"label": "Confirm tender board approval", "done": false},
    {"label": "Review technical evaluation report", "done": false},
    {"label": "Check budget allocation", "done": false},
    {"label": "Sign off or escalate to PS", "done": false}
  ]'::jsonb
),
(
  'Weekly GPL Ops Review',
  'Recurring weekly operational review for GPL',
  'gpl',
  'medium',
  '[
    {"label": "Review SAIDI/SAIFI from last 7 days", "done": false},
    {"label": "Check outage log and pending restorations", "done": false},
    {"label": "Review pending service connections (Track A and B)", "done": false},
    {"label": "Flag any generation capacity concerns", "done": false}
  ]'::jsonb
),
(
  'Contract Approval',
  'Final approval checklist before contract execution',
  null,
  'critical',
  '[
    {"label": "Legal review complete", "done": false},
    {"label": "Finance sign-off received", "done": false},
    {"label": "PS approval confirmed", "done": false},
    {"label": "Signed contract filed", "done": false}
  ]'::jsonb
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- STATUS + PRIORITY MIGRATION
-- Run this block AFTER confirming the schema upgrade above
-- Safe to run multiple times (idempotent)
-- ============================================================

-- Map old status values to the new 4-status pipeline
UPDATE tasks SET status = 'new'    WHERE status = 'not_started';
UPDATE tasks SET status = 'active' WHERE status = 'in_progress';
UPDATE tasks SET status = 'done'   WHERE status = 'completed';
-- 'blocked' stays 'blocked'

-- Set completed_at for tasks that are already done
UPDATE tasks SET completed_at = updated_at WHERE status = 'done' AND completed_at IS NULL;

-- Map old priority value
UPDATE tasks SET priority = 'critical' WHERE priority = 'urgent';

-- Now lock the constraints to final values only
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('new', 'active', 'blocked', 'done'));

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'critical'));
