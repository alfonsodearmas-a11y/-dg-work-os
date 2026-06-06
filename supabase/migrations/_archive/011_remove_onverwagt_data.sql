-- Migration: Remove all Onverwagt station data
-- Onverwagt power station was permanently abandoned. Commit 4409d44 removed it
-- from code-level references, but historical data remains in the database.
-- This migration purges that data and ensures the station never appears in views.
--
-- DR-SAFE GUARD (2026-06-05): the gpl_* tables below are out-of-band schema (they
-- are NOT created by any migration), so on a fresh/rebuilt database they do not
-- exist and these statements would error with "relation does not exist", breaking
-- the whole chain at 011. Each statement is now guarded with to_regclass() so it
-- cleanly no-ops when its target table is absent. On production the tables exist
-- and the cleanup already ran, so the guarded statements still match zero
-- Onverwagt rows — prod end-state is unchanged whether or not this re-runs.
DO $$
BEGIN
  -- 1. Delete Onverwagt from unit-level data
  IF to_regclass('public.gpl_daily_units') IS NOT NULL THEN
    DELETE FROM gpl_daily_units WHERE station ILIKE '%onverwagt%';
  END IF;

  -- 2. Delete Onverwagt from station-level aggregates
  IF to_regclass('public.gpl_daily_stations') IS NOT NULL THEN
    DELETE FROM gpl_daily_stations WHERE station ILIKE '%onverwagt%';
  END IF;

  -- 3. Delete any cached AI analysis that references Onverwagt
  --    (these will be regenerated on next request)
  IF to_regclass('public.gpl_analysis') IS NOT NULL THEN
    DELETE FROM gpl_analysis WHERE analysis_data::text ILIKE '%onverwagt%';
  END IF;

  IF to_regclass('public.gpl_uploads') IS NOT NULL THEN
    -- 5. Clean Onverwagt from gpl_uploads.raw_data JSONB — stations array
    UPDATE gpl_uploads
    SET raw_data = jsonb_set(
      raw_data,
      '{schedule,stations}',
      COALESCE(
        (SELECT jsonb_agg(s)
         FROM jsonb_array_elements(raw_data->'schedule'->'stations') s
         WHERE s->>'station' NOT ILIKE '%onverwagt%'),
        '[]'::jsonb
      )
    )
    WHERE raw_data->'schedule'->'stations' IS NOT NULL
      AND raw_data::text ILIKE '%onverwagt%';

    -- 6. Clean Onverwagt from gpl_uploads.raw_data JSONB — units array
    UPDATE gpl_uploads
    SET raw_data = jsonb_set(
      raw_data,
      '{schedule,units}',
      COALESCE(
        (SELECT jsonb_agg(u)
         FROM jsonb_array_elements(raw_data->'schedule'->'units') u
         WHERE u->>'station' NOT ILIKE '%onverwagt%'),
        '[]'::jsonb
      )
    )
    WHERE raw_data->'schedule'->'units' IS NOT NULL
      AND raw_data::text ILIKE '%onverwagt%';
  END IF;
END $$;
