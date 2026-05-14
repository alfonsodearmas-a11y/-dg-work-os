-- Fix the poisoned GWI snapshot for 2026-05-14.
--
-- Background: createSnapshot() in lib/pending-applications-snapshots.ts
-- aggregates from records.days_waiting at parse time. The May 8 GWI extract
-- has no DAYS_DIFFERENCE column, so the parser stamped days_waiting = 0 on
-- every row. The 2026-05-14 snapshot was therefore written with
-- avgDaysWaiting = 0, maxDaysWaiting = 0, over30Count = 0, which makes the
-- Trend Chart on the Overview tab lie.
--
-- This UPDATE rewrites the row in place using aggregates from the
-- pending_applications_with_wait view (migration 111), where days_waiting
-- is the live Guyana-local computation. Run after migration 111 is in
-- place. Re-running this migration is safe; it is fully idempotent.

UPDATE pending_application_snapshots
SET
  total_count = (
    SELECT COUNT(*)::int
    FROM pending_applications_with_wait
    WHERE agency = 'GWI'
  ),
  summary_data = jsonb_build_object(
    'avgDaysWaiting', (
      SELECT COALESCE(ROUND(AVG(days_waiting))::int, 0)
      FROM pending_applications_with_wait
      WHERE agency = 'GWI'
    ),
    'maxDaysWaiting', (
      SELECT COALESCE(MAX(days_waiting), 0)
      FROM pending_applications_with_wait
      WHERE agency = 'GWI'
    ),
    'over30Count', (
      SELECT COUNT(*)::int
      FROM pending_applications_with_wait
      WHERE agency = 'GWI' AND days_waiting > 30
    ),
    'byRegion', COALESCE((
      SELECT jsonb_object_agg(region_key, n)
      FROM (
        SELECT COALESCE(region, 'Unknown') AS region_key, COUNT(*) AS n
        FROM pending_applications_with_wait
        WHERE agency = 'GWI'
        GROUP BY COALESCE(region, 'Unknown')
      ) r
    ), '{}'::jsonb)
  )
WHERE agency = 'GWI'
  AND snapshot_date = DATE '2026-05-14';
