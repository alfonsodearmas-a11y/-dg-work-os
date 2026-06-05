-- ============================================================
-- Migration 061: RLS on task sub-tables + CASCADE DELETE FKs
-- ============================================================
-- PART A: Row Level Security on task_activity, task_comments,
--         subtasks, and activity_logs
-- PART B: CASCADE DELETE on task sub-table FK → tasks(id)
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- PART A — RLS POLICIES
-- ════════════════════════════════════════════════════════════

-- ── 1. task_activity (append-only audit log) ─────────────────
ALTER TABLE task_activity ENABLE ROW LEVEL SECURITY;

-- SELECT: task owner, task assignee, or ministry-level role
DROP POLICY IF EXISTS task_activity_select ON task_activity;
CREATE POLICY task_activity_select ON task_activity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_activity.task_id
        AND (
          tasks.owner_user_id = auth.uid()
          OR tasks.assigned_by_user_id = auth.uid()
        )
    )
    OR is_dg_or_above()
  );

-- INSERT: same ownership check (user is recording activity on their task)
DROP POLICY IF EXISTS task_activity_insert ON task_activity;
CREATE POLICY task_activity_insert ON task_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_activity.task_id
        AND (
          tasks.owner_user_id = auth.uid()
          OR tasks.assigned_by_user_id = auth.uid()
        )
    )
    OR is_dg_or_above()
  );

-- No UPDATE/DELETE — append-only audit log

DROP POLICY IF EXISTS task_activity_service_all ON task_activity;
CREATE POLICY task_activity_service_all ON task_activity
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 2. task_comments ─────────────────────────────────────────
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: task owner/assignee or ministry-level role
DROP POLICY IF EXISTS task_comments_select ON task_comments;
CREATE POLICY task_comments_select ON task_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_comments.task_id
        AND (
          tasks.owner_user_id = auth.uid()
          OR tasks.assigned_by_user_id = auth.uid()
        )
    )
    OR is_dg_or_above()
  );

-- INSERT: any authenticated user can comment on visible tasks
DROP POLICY IF EXISTS task_comments_insert ON task_comments;
CREATE POLICY task_comments_insert ON task_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_comments.task_id
        AND (
          tasks.owner_user_id = auth.uid()
          OR tasks.assigned_by_user_id = auth.uid()
        )
    )
    OR is_dg_or_above()
  );

-- UPDATE: comment author only
DROP POLICY IF EXISTS task_comments_update ON task_comments;
CREATE POLICY task_comments_update ON task_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- DELETE: comment author only
DROP POLICY IF EXISTS task_comments_delete ON task_comments;
CREATE POLICY task_comments_delete ON task_comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS task_comments_service_all ON task_comments;
CREATE POLICY task_comments_service_all ON task_comments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 3. subtasks ──────────────────────────────────────────────
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

-- SELECT: task owner/assignee or ministry-level role
DROP POLICY IF EXISTS subtasks_select ON subtasks;
CREATE POLICY subtasks_select ON subtasks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = subtasks.task_id
        AND (
          tasks.owner_user_id = auth.uid()
          OR tasks.assigned_by_user_id = auth.uid()
        )
    )
    OR is_dg_or_above()
  );

-- INSERT: task owner or ministry-level role
DROP POLICY IF EXISTS subtasks_insert ON subtasks;
CREATE POLICY subtasks_insert ON subtasks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = subtasks.task_id
        AND (
          tasks.owner_user_id = auth.uid()
          OR tasks.assigned_by_user_id = auth.uid()
        )
    )
    OR is_dg_or_above()
  );

-- UPDATE: task owner or ministry-level role
DROP POLICY IF EXISTS subtasks_update ON subtasks;
CREATE POLICY subtasks_update ON subtasks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = subtasks.task_id
        AND (
          tasks.owner_user_id = auth.uid()
          OR tasks.assigned_by_user_id = auth.uid()
        )
    )
    OR is_dg_or_above()
  );

-- DELETE: task owner or ministry-level role
DROP POLICY IF EXISTS subtasks_delete ON subtasks;
CREATE POLICY subtasks_delete ON subtasks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = subtasks.task_id
        AND (
          tasks.owner_user_id = auth.uid()
          OR tasks.assigned_by_user_id = auth.uid()
        )
    )
    OR is_dg_or_above()
  );

DROP POLICY IF EXISTS subtasks_service_all ON subtasks;
CREATE POLICY subtasks_service_all ON subtasks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 4. activity_logs (append-only system audit) ──────────────
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: own logs or ministry-level role
DROP POLICY IF EXISTS activity_logs_select ON activity_logs;
CREATE POLICY activity_logs_select ON activity_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_dg_or_above());

-- INSERT: any authenticated user (system records actions)
DROP POLICY IF EXISTS activity_logs_insert ON activity_logs;
CREATE POLICY activity_logs_insert ON activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- No UPDATE/DELETE — append-only audit log

DROP POLICY IF EXISTS activity_logs_service_all ON activity_logs;
CREATE POLICY activity_logs_service_all ON activity_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- PART B — CASCADE DELETE on task sub-table FKs
-- ════════════════════════════════════════════════════════════
-- Safely drop existing FK constraints (if any) before
-- recreating with ON DELETE CASCADE. Uses DO blocks so
-- the migration is idempotent.
-- ════════════════════════════════════════════════════════════

-- ── task_activity → tasks(id) ON DELETE CASCADE ──────────────
DO $$
DECLARE
  _constraint_name text;
BEGIN
  -- Find any existing FK from task_activity.task_id → tasks
  SELECT tc.constraint_name INTO _constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'task_activity'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'task_id'
  LIMIT 1;

  -- Drop existing FK if found
  IF _constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE task_activity DROP CONSTRAINT %I', _constraint_name);
  END IF;

  -- Create new FK with CASCADE
  ALTER TABLE task_activity
    ADD CONSTRAINT task_activity_task_fk
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
END $$;

-- ── task_comments → tasks(id) ON DELETE CASCADE ──────────────
DO $$
DECLARE
  _constraint_name text;
BEGIN
  SELECT tc.constraint_name INTO _constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'task_comments'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'task_id'
  LIMIT 1;

  IF _constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE task_comments DROP CONSTRAINT %I', _constraint_name);
  END IF;

  ALTER TABLE task_comments
    ADD CONSTRAINT task_comments_task_fk
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
END $$;

-- ── subtasks → tasks(id) ON DELETE CASCADE ───────────────────
DO $$
DECLARE
  _constraint_name text;
BEGIN
  SELECT tc.constraint_name INTO _constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'subtasks'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'task_id'
  LIMIT 1;

  IF _constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE subtasks DROP CONSTRAINT %I', _constraint_name);
  END IF;

  ALTER TABLE subtasks
    ADD CONSTRAINT subtasks_task_fk
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
END $$;
