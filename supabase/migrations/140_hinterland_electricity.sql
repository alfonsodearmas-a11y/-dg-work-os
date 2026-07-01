-- 140_hinterland_electricity.sql
--
-- Electricity tracker (owned by the Hinterland Communities module). Phase 2.
-- Built empty and ready, mirroring the water tables exactly so the profile's
-- Electricity tab has the same shape as Water: a 1:1 status record, a many
-- sources/systems table, and status history. No data is loaded now.

CREATE TABLE public.electricity_status (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id            uuid NOT NULL UNIQUE REFERENCES public.communities(id) ON DELETE CASCADE,
  status                  text NOT NULL DEFAULT 'unknown',  -- adequate|partial|none|unknown
  coverage_percent        numeric,
  system_type             text,             -- grid|solar|hybrid|generator|none (hinterland_option_types)
  provider                text,
  existing_infrastructure text,
  proposed_solutions      text,
  remarks                 text,
  last_updated            date,
  source_sheet            text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES public.users(id),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES public.users(id),
  CONSTRAINT electricity_status_coverage_range
    CHECK (coverage_percent IS NULL OR (coverage_percent >= 0 AND coverage_percent <= 100))
);
CREATE INDEX electricity_status_status_idx ON public.electricity_status (status);

CREATE TABLE public.electricity_sources (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id   uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  source_name    text NOT NULL,
  source_type    text,             -- solar_pv|generator|grid_feeder|hydro|other
  source_status  text,             -- active|inactive|pending_activation
  capacity_kw    numeric,
  capacity_raw   text,
  comments       text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES public.users(id),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES public.users(id)
);
CREATE INDEX electricity_sources_community_idx ON public.electricity_sources (community_id);

CREATE TABLE public.electricity_status_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  previous_status text,
  new_status      text NOT NULL,
  reason          text,
  changed_by      uuid REFERENCES public.users(id),
  changed_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX electricity_status_log_community_idx ON public.electricity_status_log (community_id, changed_at DESC);

ALTER TABLE public.electricity_status     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electricity_sources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electricity_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY electricity_status_read     ON public.electricity_status     AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY electricity_sources_read    ON public.electricity_sources    AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY electricity_status_log_read ON public.electricity_status_log AS PERMISSIVE FOR SELECT TO authenticated USING (true);
