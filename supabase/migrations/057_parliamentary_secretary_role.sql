-- ============================================================
-- Migration 057: Add Parliamentary Secretary role + update hierarchy levels
-- ============================================================
-- Changes:
--   1. Add 'parl_sec' to users.role CHECK constraint
--   2. Update users_agency_check to include parl_sec as ministry role
--   3. Insert parl_sec role into roles table (Level 6)
--   4. Update hierarchy levels: DG 5→7, Minister 5→7, PS 4→5
--   5. Grant ALL permissions to parl_sec and PS
--   6. Update module default_roles to include parl_sec
--   7. Update RLS policies to include parl_sec
-- ============================================================

-- ── 1. Update users.role CHECK constraint ──────────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('dg', 'minister', 'ps', 'parl_sec', 'agency_admin', 'officer'));

-- ── 2. Update users_agency_check constraint ────────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_agency_check;
ALTER TABLE users ADD CONSTRAINT users_agency_check
  CHECK (
    (role IN ('dg', 'minister', 'ps', 'parl_sec') AND agency IS NULL) OR
    (role IN ('agency_admin', 'officer') AND agency IS NOT NULL)
  );

-- ── 3. Insert Parliamentary Secretary role ─────────────────────────────
INSERT INTO roles (name, display_name, description, hierarchy_level, is_custom) VALUES
  ('parl_sec', 'Parliamentary Secretary', 'Member of Parliament. Full system access and visibility across all agencies.', 6, false)
ON CONFLICT (name) DO NOTHING;

-- ── 4. Update hierarchy levels ─────────────────────────────────────────
UPDATE roles SET hierarchy_level = 7 WHERE name = 'dg';
UPDATE roles SET hierarchy_level = 7 WHERE name = 'minister';
-- parl_sec already inserted as 6
UPDATE roles SET hierarchy_level = 5 WHERE name = 'ps';
-- agency_admin stays at 3, officer stays at 2

-- ── 5. Grant ALL permissions to parl_sec (same as DG/Minister) ─────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, core_permissions p
WHERE r.name = 'parl_sec'
ON CONFLICT DO NOTHING;

-- Grant ALL permissions to PS (upgrade from non-admin-only to full access)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, core_permissions p
WHERE r.name = 'ps'
ON CONFLICT DO NOTHING;

-- ── 6. Update module default_roles to include parl_sec ─────────────────
-- All modules that include 'ps' should also include 'parl_sec'
UPDATE modules
SET default_roles = array_append(default_roles, 'parl_sec')
WHERE 'ps' = ANY(default_roles)
  AND NOT ('parl_sec' = ANY(default_roles));

-- ── 7. Update RLS policies to include parl_sec ────────────────────────

-- 7a. tasks_access (from 022)
DROP POLICY IF EXISTS tasks_access ON tasks;
CREATE POLICY tasks_access ON tasks FOR ALL
  USING (
    owner_user_id = auth.uid()
    OR assigned_by_user_id = auth.uid()
    OR (SELECT role FROM users WHERE id = auth.uid()) IN ('dg', 'minister', 'ps', 'parl_sec')
  );

-- 7b. projects_ministry_read (from 045)
DROP POLICY IF EXISTS projects_ministry_read ON projects;
CREATE POLICY projects_ministry_read ON projects
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('dg', 'minister', 'ps', 'parl_sec')
    )
  );

-- 7c. projects_ministry_update (from 045)
DROP POLICY IF EXISTS projects_ministry_update ON projects;
CREATE POLICY projects_ministry_update ON projects
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('dg', 'ps', 'parl_sec')
    )
  );

-- 7d. documents_ministry_read (from 045)
DROP POLICY IF EXISTS documents_ministry_read ON documents;
CREATE POLICY documents_ministry_read ON documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('dg', 'minister', 'ps', 'parl_sec')
    )
  );

-- 7e. agency_health_snapshots_ministry_read (from 050)
DROP POLICY IF EXISTS agency_health_snapshots_ministry_read ON agency_health_snapshots;
CREATE POLICY agency_health_snapshots_ministry_read
  ON agency_health_snapshots FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('dg', 'minister', 'ps', 'parl_sec')
    )
  );

-- 7f. kpi_alerts_ministry_read (from 050)
DROP POLICY IF EXISTS kpi_alerts_ministry_read ON kpi_alerts;
CREATE POLICY kpi_alerts_ministry_read
  ON kpi_alerts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('dg', 'minister', 'ps', 'parl_sec')
    )
  );

-- 7g. procurement_packages ministry select (from 052)
DROP POLICY IF EXISTS pp_ministry_select ON procurement_packages;
CREATE POLICY pp_ministry_select ON procurement_packages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role IN ('dg', 'minister', 'ps', 'parl_sec')
    )
  );

-- 7h. procurement_stage_history ministry select (from 052)
DROP POLICY IF EXISTS psh_ministry_select ON procurement_stage_history;
CREATE POLICY psh_ministry_select ON procurement_stage_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role IN ('dg', 'minister', 'ps', 'parl_sec')
    )
  );

-- 7i. procurement_documents ministry select (from 052)
DROP POLICY IF EXISTS pd_ministry_select ON procurement_documents;
CREATE POLICY pd_ministry_select ON procurement_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role IN ('dg', 'minister', 'ps', 'parl_sec')
    )
  );

-- 7j. procurement_notes ministry select (from 052)
DROP POLICY IF EXISTS pn_ministry_select ON procurement_notes;
CREATE POLICY pn_ministry_select ON procurement_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role IN ('dg', 'minister', 'ps', 'parl_sec')
    )
  );

-- 7k. procurement_import_batches ministry select (from 055)
DROP POLICY IF EXISTS pib_ministry_select ON procurement_import_batches;
CREATE POLICY pib_ministry_select ON procurement_import_batches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (auth.jwt()->>'userId')::uuid
        AND role IN ('dg', 'minister', 'ps', 'parl_sec')
    )
  );
