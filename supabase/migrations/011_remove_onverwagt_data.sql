-- Migration: Remove all Onverwagt station data
-- Onverwagt power station was permanently abandoned. Commit 4409d44 removed it
-- from code-level references, but historical data remains in the database.
-- This migration purges that data and ensures the station never appears in views.

-- 1. Delete Onverwagt from unit-level data
DELETE FROM gpl_daily_units WHERE station ILIKE '%onverwagt%';

-- 2. Delete Onverwagt from station-level aggregates
DELETE FROM gpl_daily_stations WHERE station ILIKE '%onverwagt%';

-- 3. Delete any cached AI analysis that references Onverwagt
--    (these will be regenerated on next request)
DELETE FROM gpl_analysis WHERE analysis_data::text ILIKE '%onverwagt%';

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
