-- Migration 045: Password auth support + RLS hardening for agency scoping
-- Run manually in Supabase Dashboard SQL Editor

-- ============================================================
-- 1. ADD password_hash COLUMN to users table
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- ============================================================
-- 2. ENFORCE agency values via CHECK constraint
-- ============================================================
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_agency_values;
ALTER TABLE users ADD CONSTRAINT users_agency_values
  CHECK (
    agency IS NULL
    OR LOWER(agency) IN ('gpl', 'gwi', 'cjia', 'gcaa', 'marad', 'heci', 'has')
  );

-- ============================================================
-- 3. PROJECTS — Add agency-scoped RLS
-- ============================================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS projects_ministry_read ON projects;
DROP POLICY IF EXISTS projects_agency_read ON projects;
DROP POLICY IF EXISTS projects_ministry_update ON projects;
DROP POLICY IF EXISTS projects_service_all ON projects;

-- Service role bypasses RLS, but define policies for anon/authenticated key usage

-- Ministry roles see all projects
CREATE POLICY projects_ministry_read ON projects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('dg', 'minister', 'ps')
    )
  );

-- Agency users see only their agency's projects (sub_agency match)
CREATE POLICY projects_agency_read ON projects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('agency_admin', 'officer')
        AND UPPER(users.agency) = UPPER(projects.sub_agency)
    )
  );

-- DG/PS can update projects (health, escalation, assignment)
CREATE POLICY projects_ministry_update ON projects
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('dg', 'ps')
    )
  );

-- Service role (API routes) needs full access
CREATE POLICY projects_service_all ON projects
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 4. DOCUMENTS — Tighten agency scoping
-- ============================================================
-- Drop existing broad policy
DROP POLICY IF EXISTS documents_access ON documents;
DROP POLICY IF EXISTS documents_ministry_read ON documents;
DROP POLICY IF EXISTS documents_agency_read ON documents;
DROP POLICY IF EXISTS documents_insert ON documents;
DROP POLICY IF EXISTS documents_delete ON documents;
DROP POLICY IF EXISTS documents_service_all ON documents;

-- Ministry roles see all documents
CREATE POLICY documents_ministry_read ON documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('dg', 'minister', 'ps')
    )
  );

-- Agency users see their agency's documents + untagged documents
CREATE POLICY documents_agency_read ON documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('agency_admin', 'officer')
        AND (
          UPPER(users.agency) = UPPER(documents.agency)
          OR documents.agency IS NULL
        )
    )
  );

-- DG/PS/agency_admin can insert documents
CREATE POLICY documents_insert ON documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('dg', 'ps', 'agency_admin')
    )
  );

-- DG can delete documents
CREATE POLICY documents_delete ON documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'dg'
    )
  );

-- Service role full access
CREATE POLICY documents_service_all ON documents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 5. GPL DATA — Restrict write access to authorized uploaders
-- ============================================================

-- gpl_snapshots: keep read open, restrict write
DROP POLICY IF EXISTS "gpl_snapshots_read" ON gpl_snapshots;
DROP POLICY IF EXISTS "gpl_snapshots_write" ON gpl_snapshots;
DROP POLICY IF EXISTS gpl_snapshots_service_all ON gpl_snapshots;

CREATE POLICY gpl_snapshots_read ON gpl_snapshots
  FOR SELECT TO authenticated USING (true);

CREATE POLICY gpl_snapshots_write ON gpl_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role = 'dg' OR (users.role IN ('agency_admin', 'officer') AND UPPER(users.agency) = 'GPL'))
    )
  );

CREATE POLICY gpl_snapshots_service_all ON gpl_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- gpl_outstanding
DROP POLICY IF EXISTS "gpl_outstanding_read" ON gpl_outstanding;
DROP POLICY IF EXISTS "gpl_outstanding_write" ON gpl_outstanding;
DROP POLICY IF EXISTS gpl_outstanding_service_all ON gpl_outstanding;

CREATE POLICY gpl_outstanding_read ON gpl_outstanding
  FOR SELECT TO authenticated USING (true);

CREATE POLICY gpl_outstanding_write ON gpl_outstanding
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role = 'dg' OR (users.role IN ('agency_admin', 'officer') AND UPPER(users.agency) = 'GPL'))
    )
  );

CREATE POLICY gpl_outstanding_service_all ON gpl_outstanding
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- gpl_completed
DROP POLICY IF EXISTS "gpl_completed_read" ON gpl_completed;
DROP POLICY IF EXISTS "gpl_completed_write" ON gpl_completed;
DROP POLICY IF EXISTS gpl_completed_service_all ON gpl_completed;

CREATE POLICY gpl_completed_read ON gpl_completed
  FOR SELECT TO authenticated USING (true);

CREATE POLICY gpl_completed_write ON gpl_completed
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role = 'dg' OR (users.role IN ('agency_admin', 'officer') AND UPPER(users.agency) = 'GPL'))
    )
  );

CREATE POLICY gpl_completed_service_all ON gpl_completed
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- gpl_snapshot_metrics (read-only for non-service)
DROP POLICY IF EXISTS "gpl_snapshot_metrics_read" ON gpl_snapshot_metrics;
DROP POLICY IF EXISTS gpl_snapshot_metrics_service_all ON gpl_snapshot_metrics;

CREATE POLICY gpl_snapshot_metrics_read ON gpl_snapshot_metrics
  FOR SELECT TO authenticated USING (true);

CREATE POLICY gpl_snapshot_metrics_service_all ON gpl_snapshot_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);
