-- 127_is_owner_flag.sql
-- Phase 1 of the role simplification (docs/role-simplification-plan.md, decision D4).
--
-- Adds a minimal `is_owner` flag: ONLY the owner account may create or promote
-- superadmins (currently: assign ministry roles). This is the one deliberate
-- deviation from the pure two-level model. Additive column + a single-row
-- UPDATE — does NOT touch users_role_check or the role enum (Phases 2–3).
--
-- Enforcement lives in app code (app/api/admin/users/*): assigning a senior
-- role, or modifying/deleting an is_owner user, requires actor.is_owner.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_owner IS
  'System owner. Only an owner can create/promote superadmins (D4, role-simplification plan). Display/permission roles do not grant this.';

UPDATE public.users
  SET is_owner = true
  WHERE email = 'alfonso.dearmas@mpua.gov.gy';
