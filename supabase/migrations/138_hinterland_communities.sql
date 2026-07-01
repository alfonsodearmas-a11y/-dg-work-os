-- 138_hinterland_communities.sql
--
-- Hinterland Communities module — the community spine.
-- Community-centric: each community is the organizing key for Water (owned here),
-- Electricity (owned here, phase 2), and Airstrips (READ from the existing
-- Hinterland Airstrips module via nearest_airstrip_id — no airstrip data is copied).
--
-- Initial water register source: GWI "Situation Analysis of Hinterland Regions".
-- No coordinates exist in that source, so latitude/longitude are nullable and stay
-- NULL until geocoding (region-aggregation view now, point map later).

CREATE TABLE public.communities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  region              integer NOT NULL,
  sub_district        text,
  community_type      text,            -- nullable; vocabulary lives in hinterland_option_types
  population          integer,
  population_source   text,            -- e.g. 'MOH 2024'
  latitude            numeric,         -- NULL until geocoded
  longitude           numeric,
  nearest_airstrip_id uuid REFERENCES public.airstrips(id) ON DELETE SET NULL,
  source_sheet        text,            -- provenance from the register import
  remarks             text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES public.users(id),
  CONSTRAINT communities_region_valid CHECK (region BETWEEN 1 AND 10)
);

-- One community per (region, name), case-insensitive. Blocks duplicate imports
-- such as the register's "Reg 2 alone" duplicate sheet.
CREATE UNIQUE INDEX communities_region_name_key
  ON public.communities (region, lower(name));

CREATE INDEX communities_region_idx ON public.communities (region);
CREATE INDEX communities_nearest_airstrip_idx ON public.communities (nearest_airstrip_id);

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
-- Reads: any authenticated user (mirrors the airstrip tables' authenticated_select).
-- Writes: via the service role (supabaseAdmin) through requireModuleAccess routes,
-- which bypasses RLS — so no write policy is defined (default deny for clients).
CREATE POLICY communities_read ON public.communities
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);
