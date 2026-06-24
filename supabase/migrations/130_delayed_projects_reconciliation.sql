-- 130_delayed_projects_reconciliation.sql
-- Delayed Projects Oversight — snapshot reconciliation backbone.
--
-- ADDITIVE ONLY: new nullable columns, a new table, new indexes, and a CHECK
-- constraint. No DROP / RENAME / ALTER COLUMN TYPE / data backfill.
-- `delayed_projects.status` already defaults to 'DELAYED' (migration 074), so
-- every existing row classifies correctly with no backfill statement.
--
-- Pairs with: lib/delayed-projects/reconcile.ts (planner + executor),
-- app/api/delayed-projects/upload/route.ts.

-- ── 1. upload_batches — one row per upload; the audit/reconciliation backbone ──
CREATE TABLE IF NOT EXISTS upload_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name      text,
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  uploaded_by    text,
  row_count      integer NOT NULL DEFAULT 0,
  new_count      integer NOT NULL DEFAULT 0,
  updated_count  integer NOT NULL DEFAULT 0,
  resolved_count integer NOT NULL DEFAULT 0,
  reopened_count integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE upload_batches ENABLE ROW LEVEL SECURITY;

-- NO public SELECT policy: uploader emails + filenames must not be exposed to
-- every role. All reads are server-side via service_role (bypasses RLS); there
-- is no client-side reader of this table (the cleared view / analytics fetch
-- batch fields through API routes). With RLS on and no SELECT policy,
-- anon/authenticated cannot read it; service_role still can.
CREATE POLICY ub_service_all ON upload_batches FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_ub_uploaded_at ON upload_batches(uploaded_at DESC);

-- ── 2. delayed_projects — reconciliation columns (all nullable) ───────────────
ALTER TABLE delayed_projects
  ADD COLUMN IF NOT EXISTS source_id            bigint,
  ADD COLUMN IF NOT EXISTS resolved_at          timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_at          timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_batch_id   uuid REFERENCES upload_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_by_batch_id uuid REFERENCES upload_batches(id) ON DELETE SET NULL;

-- source_id = numeric "View Project" id from the oversight export (primary
-- reconciliation key). status already has idx_dp_status from migration 074.
CREATE INDEX IF NOT EXISTS idx_dp_source_id ON delayed_projects(source_id);

-- ── 3. status validation — text + CHECK (non-destructive enum equivalent) ─────
-- Keeps the existing `status text` column (no ALTER COLUMN TYPE). NOT VALID then
-- VALIDATE avoids a long exclusive lock; all existing rows are already 'DELAYED'
-- so VALIDATE succeeds. Guarded so a branch replay / re-run is idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delayed_projects_status_check'
  ) THEN
    ALTER TABLE delayed_projects
      ADD CONSTRAINT delayed_projects_status_check
      CHECK (status IN ('DELAYED', 'RESOLVED')) NOT VALID;
    ALTER TABLE delayed_projects VALIDATE CONSTRAINT delayed_projects_status_check;
  END IF;
END $$;
