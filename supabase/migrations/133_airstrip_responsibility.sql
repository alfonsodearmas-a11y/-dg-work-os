-- 133_airstrip_responsibility.sql
--
-- Phase 1: responsibility model — every airstrip can carry a responsible
-- contractor (history-tracked) and a responsible manager. These names drive the
-- warning copy ("Kato is 22 days overdue — contractor: J. Williams, manager: Akeem")
-- and the per-airstrip report.
--
-- Also adds the per-airstrip cadence override. NULL = inherit
-- airstrip_settings.default_interval_days (NOT seeded — see migration 132).

ALTER TABLE public.airstrips
  ADD COLUMN target_maintenance_interval_days integer,
  ADD COLUMN responsible_manager_id uuid REFERENCES public.users(id);

ALTER TABLE public.airstrips
  ADD CONSTRAINT airstrips_target_interval_positive
  CHECK (target_maintenance_interval_days IS NULL OR target_maintenance_interval_days > 0);

-- Contractor directory (global; not agency-scoped — only the Hinterland Airstrips
-- manager + superadmin reach the write routes via requireAirstripAccess).
CREATE TABLE public.contractors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  contact    text,
  whatsapp   text,
  active     boolean NOT NULL DEFAULT true,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id)
);

-- Responsibility assignments with history. The current responsible contractor is
-- the row with effective_to IS NULL; reassigning closes the open row and opens a new one.
CREATE TABLE public.airstrip_contractors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airstrip_id    uuid NOT NULL REFERENCES public.airstrips(id) ON DELETE CASCADE,
  contractor_id  uuid NOT NULL REFERENCES public.contractors(id),
  effective_from date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Guyana')::date,
  effective_to   date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES public.users(id),
  CONSTRAINT airstrip_contractors_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX idx_airstrip_contractors_airstrip ON public.airstrip_contractors(airstrip_id);
CREATE INDEX idx_airstrip_contractors_contractor ON public.airstrip_contractors(contractor_id);
-- At most one OPEN (current) assignment per airstrip.
CREATE UNIQUE INDEX idx_airstrip_contractors_one_open
  ON public.airstrip_contractors(airstrip_id) WHERE effective_to IS NULL;

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airstrip_contractors ENABLE ROW LEVEL SECURITY;
CREATE POLICY contractors_read ON public.contractors
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY airstrip_contractors_read ON public.airstrip_contractors
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);
-- Writes via the service role through requireAirstripAccess routes (RLS-bypassing).
