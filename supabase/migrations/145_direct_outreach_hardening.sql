-- 145_direct_outreach_hardening.sql
--
-- Review hardening for the Direct Outreach module (follows 144):
--
-- 1. Drop the authenticated-read RLS policies. The module is served exclusively
--    through the requireModuleAccess API routes over the lib/db-pg pool (table
--    owner, bypasses RLS), and agency scoping lives in those queries. A blanket
--    `TO authenticated USING (true)` policy would let ANY signed-in user read
--    every agency's rows straight through PostgREST with the anon key,
--    bypassing that scoping — so these tables are default-deny for clients.
--
-- 2. Recompute the open view's day math on the Guyana calendar day
--    (America/Guyana, UTC-4) instead of the DB session's UTC current_date, so
--    days_open / days_idle / committed_overdue don't tick over 4 hours early.
--
-- 3. NULL-safe age_bucket: a case synced with a null created_at previously fell
--    through every `current_date - NULL <= N` comparison (NULL, not true) into
--    the ELSE branch and masqueraded as 'Over 365'; it now reports 'Unknown'.

DROP POLICY direct_outreach_cases_read ON public.direct_outreach_cases;
DROP POLICY direct_outreach_updates_read ON public.direct_outreach_updates;
DROP POLICY direct_outreach_sync_state_read ON public.direct_outreach_sync_state;

CREATE OR REPLACE VIEW public.direct_outreach_open_v AS
SELECT
  c.*,
  ((now() AT TIME ZONE 'America/Guyana')::date
     - (c.created_at AT TIME ZONE 'America/Guyana')::date)              AS days_open,
  ((now() AT TIME ZONE 'America/Guyana')::date
     - (coalesce(c.last_activity_at, c.created_at) AT TIME ZONE 'America/Guyana')::date) AS days_idle,
  CASE
    WHEN c.created_at IS NULL THEN 'Unknown'
    WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 30  THEN '0-30'
    WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 90  THEN '31-90'
    WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 180 THEN '91-180'
    WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 365 THEN '181-365'
    ELSE 'Over 365'
  END                                                                   AS age_bucket,
  (c.committed_date IS NOT NULL
     AND c.committed_date < (now() AT TIME ZONE 'America/Guyana')::date) AS committed_overdue
FROM public.direct_outreach_cases c
WHERE c.status <> 'Resolved';
