-- 126_supabase_auth_fk.sql
-- Supabase Auth migration — Part 1 / P2.
--
-- ⚠️ FILE ONLY — DO NOT APPLY HERE. The ADD CONSTRAINT runs during the cutover
-- sitting (step C2), AFTER auth.users has been seeded for all 23 users via
-- scripts/auth-migration/01–03. Applying it before the seed WILL FAIL: existing
-- public.users.id values must already exist in auth.users(id).
--
-- Per project migration policy this is a FLAGGED change (adds a validated FK; the
-- optional DROP CONSTRAINT below is a destructive cleanup). Requires explicit
-- go-ahead before being applied via the Supabase MCP.

-- 1) Make auth.users canonical: every public.users row is 1:1 with an auth.users
--    row of the SAME uuid. ON DELETE CASCADE so deleting the auth user removes the
--    profile; the ON DELETE RESTRICT children (nptab_*, tasks.referred_to_minister_by)
--    still block deletion of a referenced user (desired).
ALTER TABLE public.users
  ADD CONSTRAINT users_id_authusers_fkey
  FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;

-- 2) OPTIONAL CLEANUP — FLAGGED DROP (leave commented until explicitly approved).
--    Removes the redundant lowercase agency CHECK left over from migration 045;
--    the canonical uppercase users_agency_check (migration 106) is the authority.
-- ALTER TABLE public.users DROP CONSTRAINT users_agency_values;
