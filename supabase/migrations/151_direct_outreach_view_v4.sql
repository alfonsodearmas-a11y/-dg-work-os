-- 151_direct_outreach_view_v4.sql
--
-- Direct Outreach v3 — view v4: fold officer assignment, working state, and
-- officer-activity staleness into direct_outreach_open_v so every read (scope
-- clause, filters, scorecards, sorts) computes accountability semantics in ONE
-- place, exactly as 148 did for effective_agency.
--
-- DROP + CREATE (not OR REPLACE): the column list changes shape (42P16). The
-- view is a stored query with no data; it is recreated in this same migration
-- transaction. Folding in the 149 lesson: the fresh view mints default grants,
-- so security_invoker is re-asserted AND the REVOKE is re-issued HERE, not in
-- a follow-up migration.
--
-- New semantics:
--   working_status            = COALESCE(case_state, 'not_started')
--   officer_target_date       = the explicit officer commitment (survives uploads)
--   effective_target_date     = COALESCE(officer target, auto-detected committed_date)
--                               — an explicit commitment outranks the heuristic (Q4)
--   last_officer_update_at    = newest DG-OS officer update (any author)
--   days_since_officer_action = Guyana days since GREATEST(last update, assigned_at);
--                               NULL only when unassigned AND never updated
--                               ("most neglected" — sorted to the top, Q6)

DROP VIEW public.direct_outreach_open_v;
CREATE VIEW public.direct_outreach_open_v
  WITH (security_invoker = on) AS
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
     AND c.committed_date < (now() AT TIME ZONE 'America/Guyana')::date) AS committed_overdue,
  coalesce(o.agency, c.agency)                                          AS effective_agency,
  (o.agency IS NOT NULL AND o.agency IS DISTINCT FROM c.agency)         AS transferred,
  a.assignee_user_id,
  a.assigned_at,
  coalesce(s.working_status, 'not_started')                             AS working_status,
  s.target_date                                                         AS officer_target_date,
  (s.target_date IS NOT NULL
     AND s.target_date < (now() AT TIME ZONE 'America/Guyana')::date)   AS officer_target_overdue,
  coalesce(s.target_date, c.committed_date)                             AS effective_target_date,
  (coalesce(s.target_date, c.committed_date) IS NOT NULL
     AND coalesce(s.target_date, c.committed_date)
         < (now() AT TIME ZONE 'America/Guyana')::date)                 AS effective_target_overdue,
  ou.last_officer_update_at,
  ((now() AT TIME ZONE 'America/Guyana')::date
     - (greatest(ou.last_officer_update_at, a.assigned_at)
          AT TIME ZONE 'America/Guyana')::date)                         AS days_since_officer_action
FROM public.direct_outreach_cases c
LEFT JOIN public.direct_outreach_agency_overrides o ON o.case_id = c.case_id
LEFT JOIN public.direct_outreach_assignments      a ON a.case_id = c.case_id
LEFT JOIN public.direct_outreach_case_state       s ON s.case_id = c.case_id
LEFT JOIN LATERAL (
  SELECT max(u.created_at) AS last_officer_update_at
    FROM public.direct_outreach_officer_updates u
   WHERE u.case_id = c.case_id
) ou ON true
WHERE c.status <> 'Resolved';

-- Belt-and-braces (146/149 lineage), in the SAME migration as the recreate:
ALTER VIEW public.direct_outreach_open_v SET (security_invoker = on);
REVOKE ALL ON public.direct_outreach_open_v FROM anon, authenticated;
