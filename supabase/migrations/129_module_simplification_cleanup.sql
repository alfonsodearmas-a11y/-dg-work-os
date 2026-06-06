-- 129_module_simplification_cleanup.sql
-- ⚠️ DESTRUCTIVE — approved by owner 2026-06-06 (run-everything directive).
-- Module simplification cleanup + role-flip soak items, in one pass.
-- Code stopped reading the module/role tables at commit e0ab6e5 (2026-06-06);
-- password_hash has had no readers/writers since the Supabase Auth cutover.
-- Full pre-drop contents archived locally at ~/dg-work-os-archives/129/ (8 files).
--
-- RETAINED on purpose: users.formal_title (human-facing greeting label).

-- Pre-drop snapshots kept in-DB as a second safety net (drop after next soak)
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
DROP TABLE public.invitation_tokens;       -- dead legacy invite table (0 rows, 0 code refs; live flow uses users.invite_token) — held an FK to roles
DROP TABLE public.roles;

-- Role-flip soak items (migration 128 aftermath; archived locally before drop)
ALTER TABLE public.users DROP COLUMN password_hash;          -- dead since Supabase Auth cutover
ALTER TABLE public.users DROP CONSTRAINT users_agency_values; -- legacy lowercase-tolerant CHECK (045); users_agency_check (uppercase) remains
DROP TABLE public._role_migration_backup;                     -- role-flip rollback snapshot, superseded by local archive
