-- ============================================================
-- Migration 108: task_watchers — multi-recipient task notifications
-- ============================================================
-- Adds an "Also notify" relationship between tasks and users.
-- Watchers receive the same email events as the primary assignee
-- (initial assignment, reassignment, daily reminder digest), gated
-- by each user's existing notification_preferences (mig 051).
--
-- Watchers are independent of who the primary assignee is — they
-- persist across reassignment until removed (self-removal via the
-- "Stop watching" button on the task detail surface, or by the DG).
-- ============================================================

CREATE TABLE IF NOT EXISTS task_watchers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_watchers_user ON task_watchers(user_id);
CREATE INDEX IF NOT EXISTS idx_task_watchers_task ON task_watchers(task_id);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE task_watchers ENABLE ROW LEVEL SECURITY;

-- SELECT: task owner/assigner, the watcher themselves, or DG-or-above
DROP POLICY IF EXISTS task_watchers_select ON task_watchers;
CREATE POLICY task_watchers_select ON task_watchers
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_watchers.task_id
        AND (tasks.owner_user_id = auth.uid()
             OR tasks.assigned_by_user_id = auth.uid())
    )
    OR is_dg_or_above()
  );

-- INSERT: task owner/assigner or DG-or-above can add watchers
DROP POLICY IF EXISTS task_watchers_insert ON task_watchers;
CREATE POLICY task_watchers_insert ON task_watchers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_watchers.task_id
        AND (tasks.owner_user_id = auth.uid()
             OR tasks.assigned_by_user_id = auth.uid())
    )
    OR is_dg_or_above()
  );

-- DELETE: the watcher themselves can self-remove; owner/assigner/DG can also remove
DROP POLICY IF EXISTS task_watchers_delete ON task_watchers;
CREATE POLICY task_watchers_delete ON task_watchers
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_watchers.task_id
        AND (tasks.owner_user_id = auth.uid()
             OR tasks.assigned_by_user_id = auth.uid())
    )
    OR is_dg_or_above()
  );

-- Service-role bypass for server-side fan-out
DROP POLICY IF EXISTS task_watchers_service_all ON task_watchers;
CREATE POLICY task_watchers_service_all ON task_watchers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE task_watchers IS
  'Multi-recipient watch list per task. Watchers receive the same email events as the primary assignee, gated by their own notification_preferences. Independent of owner_user_id; persists across reassignment.';
