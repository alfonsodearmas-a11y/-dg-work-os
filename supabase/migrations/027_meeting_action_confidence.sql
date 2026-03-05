-- Add confidence classification and task linkage to meeting_actions

-- confidence: AUTO_CREATE (auto-created as task) or NEEDS_REVIEW (needs user confirmation)
ALTER TABLE meeting_actions
  ADD COLUMN IF NOT EXISTS confidence TEXT NOT NULL DEFAULT 'AUTO_CREATE'
    CHECK (confidence IN ('AUTO_CREATE', 'NEEDS_REVIEW')),
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS skipped BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_meeting_actions_confidence
  ON meeting_actions(confidence) WHERE confidence = 'NEEDS_REVIEW' AND NOT done AND NOT skipped;
