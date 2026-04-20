-- 085_verify_rollover_exclusion.sql
--
-- READ-ONLY audit. Run manually in the Supabase SQL editor after deploying the
-- query-layer filter that excludes is_rollover=true from the procurement
-- tracker. No DDL, no DML — safe to run repeatedly.
--
-- Expected result after deploy:
--   NOTICE: rollovers leaking into tracker: 0
--
-- If the count is non-zero, the query-layer filter is not in effect (check
-- lib/tender/queries.ts: listTenders + getPipelineStats must apply
-- is_rollover = false).

DO $$
DECLARE
  leak_count INTEGER;
  rollover_total INTEGER;
  possibly_undetected INTEGER;
BEGIN
  SELECT COUNT(*) INTO leak_count
  FROM tender
  WHERE missing_from_last_upload = false
    AND is_rollover = true
    AND stage IN ('design', 'advertised', 'evaluation', 'awaiting_award');

  SELECT COUNT(*) INTO rollover_total
  FROM tender
  WHERE missing_from_last_upload = false
    AND is_rollover = true;

  SELECT COUNT(*) INTO possibly_undetected
  FROM tender
  WHERE missing_from_last_upload = false
    AND is_rollover = false
    AND date_of_award IS NOT NULL
    AND date_of_award < DATE '2026-01-01';

  RAISE NOTICE 'rollovers leaking into tracker: %', leak_count;
  RAISE NOTICE 'rollovers total (all stages): %', rollover_total;
  RAISE NOTICE 'possibly-undetected rollovers (is_rollover=false, prior-year award date): %', possibly_undetected;

  IF leak_count > 0 THEN
    RAISE EXCEPTION 'Rollover leak detected: % row(s) still visible at pre-award stages. Verify listTenders + getPipelineStats apply is_rollover = false.', leak_count;
  END IF;
END $$;
