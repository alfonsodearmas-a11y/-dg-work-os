-- 135_drop_stale_option_types_policy.sql
--
-- Debug carryover B10: drop the stale write policy on airstrip_option_types. It
-- keys on retired role names ('dg','minister','ps') that no longer exist after the
-- role simplification, so it never grants anything; all option-type writes go
-- through the service role (RLS-bypassing) anyway. Dead policy — remove it.
--
-- DESTRUCTIVE (DROP POLICY): do not apply until explicitly confirmed.

DROP POLICY IF EXISTS airstrip_option_types_write ON public.airstrip_option_types;
