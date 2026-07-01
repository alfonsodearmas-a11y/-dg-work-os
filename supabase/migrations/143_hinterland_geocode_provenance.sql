-- 143_hinterland_geocode_provenance.sql
--
-- Additive geocoding provenance for communities. latitude/longitude already exist
-- (nullable, from migration 138) and stay the coordinate store; this adds WHERE a
-- coordinate came from and HOW confident we are, so an un-geocoded community is an
-- honest, auditable NULL rather than an approximate pin.
--
-- Additive only: three nullable columns + a value check on confidence. Existing
-- rows keep NULL (which passes the check). Idempotent.

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS geocode_source     text,          -- e.g. 'nominatim' (query used)
  ADD COLUMN IF NOT EXISTS geocode_confidence text,          -- high | medium | low
  ADD COLUMN IF NOT EXISTS geocoded_at        timestamptz;   -- last geocode attempt

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'communities_geocode_confidence_valid'
  ) THEN
    ALTER TABLE public.communities
      ADD CONSTRAINT communities_geocode_confidence_valid
      CHECK (geocode_confidence IS NULL OR geocode_confidence IN ('high', 'medium', 'low'));
  END IF;
END $$;
