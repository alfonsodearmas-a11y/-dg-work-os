-- 146_direct_outreach_view_invoker.sql
--
-- Close the SECURITY DEFINER hole on direct_outreach_open_v (Supabase security
-- advisor ERROR). The view is owned by postgres, so without security_invoker it
-- reads the base tables with OWNER privileges — bypassing the RLS default-deny
-- that migration 145 set up — and the Supabase default grants gave anon and
-- authenticated full access to it via PostgREST. Once the tables populate,
-- that would expose every agency's case data to the public anon key.
--
-- security_invoker = on makes the view enforce the CALLER's RLS. The app is
-- unaffected: the lib/db-pg pool connects as postgres, which OWNS the base
-- tables (and relforcerowsecurity is off), so owner-bypass still applies to
-- server reads. anon/authenticated hit the policy-less RLS tables = deny-all.
-- The REVOKEs are belt-and-braces on top (no client role has any business
-- touching these objects; all access goes through the requireModuleAccess API).
--
-- Scope note: v_metrics_by_agency and pending_applications_with_wait trip the
-- same advisor ERROR but pre-date this module — they need their own reviewed
-- follow-up (their consumers may rely on definer semantics), so they are
-- deliberately NOT touched here.

ALTER VIEW public.direct_outreach_open_v SET (security_invoker = on);

REVOKE ALL ON public.direct_outreach_open_v,
              public.direct_outreach_cases,
              public.direct_outreach_updates,
              public.direct_outreach_sync_state
  FROM anon, authenticated;
