-- 132_airstrip_settings.sql
--
-- Phase 1: singleton config for maintenance cadence + warning thresholds.
-- Mirrors the psip_nag_settings pattern (single row, id = 1). Nothing hardcoded:
-- the maintenance interval, the "upcoming" window, and the verification-stale
-- threshold all live here and are editable in-app (requireAirstripAccess).
--
-- Per-airstrip override lives on airstrips.target_maintenance_interval_days
-- (migration 133); NULL there means "inherit default_interval_days" — which is
-- why we do NOT seed per-row interval values.

CREATE TABLE public.airstrip_settings (
  id                            integer PRIMARY KEY DEFAULT 1,
  default_interval_days         integer NOT NULL DEFAULT 60,
  upcoming_window_days          integer NOT NULL DEFAULT 14,
  verification_stale_after_days integer NOT NULL DEFAULT 90,
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  updated_by                    uuid REFERENCES public.users(id),
  CONSTRAINT airstrip_settings_singleton CHECK (id = 1),
  CONSTRAINT airstrip_settings_positive CHECK (
    default_interval_days > 0 AND upcoming_window_days >= 0 AND verification_stale_after_days > 0
  )
);

INSERT INTO public.airstrip_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.airstrip_settings ENABLE ROW LEVEL SECURITY;
-- Reads: any authenticated user (mirrors the airstrip tables' authenticated_select).
-- Writes: via the service role (supabaseAdmin) through requireAirstripAccess routes,
-- which bypasses RLS — so no write policy is defined (default deny for clients).
CREATE POLICY airstrip_settings_read ON public.airstrip_settings
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);
