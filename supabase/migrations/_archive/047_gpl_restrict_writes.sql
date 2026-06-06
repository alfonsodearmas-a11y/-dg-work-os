-- Restrict GPL write policies to service_role only.
-- Previously these tables allowed any authenticated user to insert/update/delete,
-- which is overly permissive. All writes go through server-side API routes that
-- use the service_role key, so authenticated users only need SELECT.

-- gpl_snapshots
DROP POLICY IF EXISTS gpl_snapshots_write ON gpl_snapshots;
CREATE POLICY gpl_snapshots_service_write ON gpl_snapshots
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- gpl_outstanding
DROP POLICY IF EXISTS gpl_outstanding_write ON gpl_outstanding;
CREATE POLICY gpl_outstanding_service_write ON gpl_outstanding
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- gpl_completed
DROP POLICY IF EXISTS gpl_completed_write ON gpl_completed;
CREATE POLICY gpl_completed_service_write ON gpl_completed
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- gpl_snapshot_metrics
DROP POLICY IF EXISTS gpl_snapshot_metrics_write ON gpl_snapshot_metrics;
CREATE POLICY gpl_snapshot_metrics_service_write ON gpl_snapshot_metrics
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- gpl_chronic_outliers
DROP POLICY IF EXISTS gpl_chronic_outliers_write ON gpl_chronic_outliers;
CREATE POLICY gpl_chronic_outliers_service_write ON gpl_chronic_outliers
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
