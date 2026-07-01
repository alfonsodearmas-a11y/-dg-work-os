-- 139_hinterland_water.sql
--
-- Water tracker (owned by the Hinterland Communities module). Phase 1 data source.
--   water_status     one current record per community (1:1).
--   water_sources    pump stations / wells per community (many). Region 9 is
--                    populated from the register today; every other community gets
--                    the same structure, empty and ready for GWI to fill in.
--   water_status_log append-only status history (mirrors airstrip_status_log) so a
--                    system that was functional last quarter and broke since is
--                    visible over time.
--
-- Register production/pressure values are messy text ("26.4m3/h", "23 PSI", "PSI").
-- We keep both a parsed numeric and the original raw string for provenance.

CREATE TABLE public.water_status (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id            uuid NOT NULL UNIQUE REFERENCES public.communities(id) ON DELETE CASCADE,
  status                  text NOT NULL DEFAULT 'unknown',  -- adequate|partial|no_system|unfunded|unknown
  coverage_percent        numeric,          -- normalized 0..100 on import
  existing_infrastructure text,
  proposed_solutions      text,
  remarks                 text,
  action                  text,             -- Region 1 register has this
  schools_access          text,
  last_updated            date,             -- register "Updated" field where present
  source_sheet            text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES public.users(id),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES public.users(id),
  CONSTRAINT water_status_coverage_range
    CHECK (coverage_percent IS NULL OR (coverage_percent >= 0 AND coverage_percent <= 100))
);
CREATE INDEX water_status_status_idx ON public.water_status (status);

CREATE TABLE public.water_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  source_name     text NOT NULL,
  source_type     text,             -- drilled_well_4/6/8, hand_dug_well, gravity_spring, creek_source
  source_status   text,             -- active|inactive|pending_activation
  production_m3hr numeric,          -- parsed from raw where possible
  production_raw  text,             -- original register string
  pressure_psi    numeric,
  pressure_raw    text,
  comments        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES public.users(id)
);
CREATE INDEX water_sources_community_idx ON public.water_sources (community_id);

CREATE TABLE public.water_status_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  previous_status text,
  new_status      text NOT NULL,
  reason          text,
  changed_by      uuid REFERENCES public.users(id),
  changed_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX water_status_log_community_idx ON public.water_status_log (community_id, changed_at DESC);

ALTER TABLE public.water_status     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_sources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY water_status_read     ON public.water_status     AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY water_sources_read    ON public.water_sources    AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY water_status_log_read ON public.water_status_log AS PERMISSIVE FOR SELECT TO authenticated USING (true);
