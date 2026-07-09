-- 149_direct_outreach_view_revoke.sql
--
-- Migration 148's DROP VIEW + CREATE VIEW minted fresh Supabase default grants
-- on direct_outreach_open_v for anon/authenticated, silently undoing the 146
-- REVOKE. Not an exposure (the view is security_invoker=on and the base tables
-- are RLS default-deny, so client roles read zero rows) — but the module's
-- posture is belt-and-braces: client roles hold NO grants on any
-- direct_outreach object. Restore it.

REVOKE ALL ON public.direct_outreach_open_v FROM anon, authenticated;
