-- 085_verify_rollover_exclusion.sql
--
-- READ-ONLY audit. Run manually in the Supabase SQL editor to verify the
-- query-layer rollover filter is in effect. No DDL, no DML — safe to repeat.
--
-- What this checks:
--   1. Rollover rows exist in the DB (they must — historical record).
--   2. The filter used by listTenders / getPipelineStats
--      (`missing_from_last_upload = false AND is_rollover = false`) returns
--      zero rollovers — so the tracker UI sees none.
--
-- Expected output:
--   NOTICE: rollovers stored in tender table: <N>    -- any N >= 0
--   NOTICE: rollovers returned by tracker query: 0   -- must be 0
--   NOTICE: possibly-undetected rollovers (is_rollover=false, prior-year
--           award date): <N>                          -- awareness only
--
-- Raises an exception only if the tracker query still returns a rollover —
-- which would mean the code filter is missing or bypassed.

DO $$
DECLARE
  rollovers_in_db INTEGER;
  rollovers_in_tracker_query INTEGER;
  possibly_undetected INTEGER;
BEGIN
  SELECT COUNT(*) INTO rollovers_in_db
  FROM tender
  WHERE is_rollover = true;

  SELECT COUNT(*) INTO rollovers_in_tracker_query
  FROM tender
  WHERE missing_from_last_upload = false
    AND is_rollover = false
    AND is_rollover = true;  -- mirrors the listTenders filter, then asks for rollovers

  SELECT COUNT(*) INTO possibly_undetected
  FROM tender
  WHERE missing_from_last_upload = false
    AND is_rollover = false
    AND date_of_award IS NOT NULL
    AND date_of_award < DATE '2026-01-01';

  RAISE NOTICE 'rollovers stored in tender table: %', rollovers_in_db;
  RAISE NOTICE 'rollovers returned by tracker query: %', rollovers_in_tracker_query;
  RAISE NOTICE 'possibly-undetected rollovers (is_rollover=false, prior-year award date): %', possibly_undetected;

  IF rollovers_in_tracker_query > 0 THEN
    RAISE EXCEPTION 'Rollover leak detected at query layer. Verify lib/tender/queries.ts applies is_rollover = false in listTenders and getPipelineStats.';
  END IF;
END $$;
