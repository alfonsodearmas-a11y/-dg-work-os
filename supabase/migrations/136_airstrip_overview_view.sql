-- 136_airstrip_overview_view.sql
--
-- Phase 1: read-side view that augments each airstrip with its DERIVED cadence
-- inputs (last maintenance, last verified) and current responsibility (contractor
-- + manager) in one query. Derived, never stored — no denormalized column to drift.
-- Reused by the list route, the detail route, the PDF report, and (later) a cron
-- digest. The warning STATES are computed in app code (lib/airstrips/warnings.ts)
-- from these inputs + airstrip_settings, so the thresholds stay editable.
--
-- security_invoker=on so RLS applies as the querying role (we query via the service
-- role in the routes); avoids a SECURITY DEFINER view advisor warning.

CREATE OR REPLACE VIEW public.airstrip_overview
WITH (security_invoker = on) AS
SELECT
  a.*,
  ms.last_maintenance_on,
  (ms.last_verified_at AT TIME ZONE 'America/Guyana')::date AS last_verified_on,
  ac.contractor_id           AS responsible_contractor_id,
  c.name                     AS responsible_contractor_name,
  mgr.name                   AS responsible_manager_name
FROM public.airstrips a
LEFT JOIN LATERAL (
  SELECT max(m.performed_date)                                  AS last_maintenance_on,
         max(m.verified_at) FILTER (WHERE m.verified)           AS last_verified_at
  FROM public.airstrip_maintenance_log m
  WHERE m.airstrip_id = a.id
) ms ON true
LEFT JOIN public.airstrip_contractors ac ON ac.airstrip_id = a.id AND ac.effective_to IS NULL
LEFT JOIN public.contractors c ON c.id = ac.contractor_id
LEFT JOIN public.users mgr ON mgr.id = a.responsible_manager_id;
