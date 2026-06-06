-- 129_module_simplification_cleanup.sql
-- ⚠️ DESTRUCTIVE — STAGED, NOT YET RUN. Requires explicit owner approval before applying.
-- Module simplification cleanup ONLY (docs/module-simplification-plan.md, Phase 4).
-- Code stopped reading every object below at commit e0ab6e5 (Phase 1, 2026-06-06).
--
-- Explicitly EXCLUDED from this migration (approval revisions, 2026-06-06):
--   * users.formal_title — RETAINED (human-facing greeting label)
--   * Role-simplification soak items (users.password_hash, _role_migration_backup,
--     users_agency_values CHECK) — separate later step after a full week of soak;
--     _role_migration_backup stays as rollback insurance for the role flip.
--
-- Pre-flight (run before applying):
--   1. Branch rehearsal: create_branch (replays prod ledger) → apply this file → verify.
--   2. grep -rn "user_module_access\|from('modules')\|role_permissions\|core_permissions\|delegated_permissions" app lib components hooks
--      → must return nothing outside supabase/migrations/.

-- Pre-drop snapshots (kept until post-soak cleanup, mirroring 128's backup pattern)
CREATE TABLE public._module_access_backup_129 AS
  SELECT u.email, m.slug, uma.access_type, uma.can_edit, uma.agency, uma.granted_at
  FROM public.user_module_access uma
  JOIN public.users u ON u.id = uma.user_id
  JOIN public.modules m ON m.id = uma.module_id;
CREATE TABLE public._modules_backup_129 AS SELECT * FROM public.modules;

-- Per-user module configurability — gone (RLS policies + indexes drop with the tables)
DROP TABLE public.user_module_access;
DROP TABLE public.modules;

-- Role→permission config now lives in code (lib/people-permissions.ts roleHasPermission)
DROP TABLE public.delegated_permissions;   -- 0 rows, no writers
DROP TABLE public.role_permissions;
DROP TABLE public.core_permissions;
DROP TABLE public.roles;
