-- 123_tasks_minister_attention_columns.sql
-- Adds the Minister-attention flag and the upstream-source linkage to tasks.
-- Replaces the parallel ministerial_referrals schema (dropped in 124).
-- Must run BEFORE 124_drop_ministerial_referrals.sql.
--
-- Column naming note: linked_source_* deliberately avoids colliding with
-- tasks.source (NOT NULL, represents the task's creation channel:
-- 'manual', 'meeting', etc., unrelated to upstream entity linkage).

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS requires_minister_attention BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS referred_to_minister_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS referred_to_minister_by     UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS minister_seen_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS minister_closed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS linked_source_type          TEXT
    CHECK (linked_source_type IS NULL OR linked_source_type IN ('tender', 'project')),
  ADD COLUMN IF NOT EXISTS linked_source_id            TEXT;

-- Minister inbox query: flagged + still open.
CREATE INDEX IF NOT EXISTS tasks_minister_attention_idx
  ON tasks(requires_minister_attention, minister_closed_at)
  WHERE requires_minister_attention = TRUE;

-- Cross-page banner lookup: given a tender or project id, find the flagged task.
CREATE INDEX IF NOT EXISTS tasks_linked_source_idx
  ON tasks(linked_source_type, linked_source_id)
  WHERE linked_source_id IS NOT NULL;

COMMENT ON COLUMN tasks.requires_minister_attention IS
  'TRUE when the DG has flagged this task as requiring the Minister''s attention.';
COMMENT ON COLUMN tasks.linked_source_type IS
  'Upstream entity type when this task originated from a tender or project. NULL otherwise.';
COMMENT ON COLUMN tasks.linked_source_id IS
  'Upstream entity primary key (tender.id or projects.project_id) when linked_source_type is set.';
