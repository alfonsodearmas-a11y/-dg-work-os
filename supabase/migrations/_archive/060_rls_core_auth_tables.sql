-- ============================================================
-- Migration 060: RLS on core auth & permission tables
-- ============================================================
-- Adds Row Level Security to 8 tables that were previously
-- unprotected:
--   users, invitation_tokens, push_subscriptions, roles,
--   core_permissions, role_permissions, object_ownership,
--   object_access_grants
--
-- Also creates a reusable helper: is_dg_or_above()
-- ============================================================

-- ── 0. Reusable helper: ministry-level role check ────────────
-- Returns TRUE for dg, minister, ps, parl_sec.
-- SECURITY DEFINER so RLS policies can call it without
-- granting direct SELECT on users to every role.
CREATE OR REPLACE FUNCTION is_dg_or_above()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role IN ('dg', 'minister', 'ps', 'parl_sec')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 1. users ─────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_dg_or_above());

DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users
  FOR INSERT TO authenticated
  WITH CHECK (is_dg_or_above());

DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users
  FOR UPDATE TO authenticated
  USING (is_dg_or_above());

DROP POLICY IF EXISTS users_delete ON users;
CREATE POLICY users_delete ON users
  FOR DELETE TO authenticated
  USING (is_dg_or_above());

-- Service role bypass (API routes use supabaseAdmin)
DROP POLICY IF EXISTS users_service_all ON users;
CREATE POLICY users_service_all ON users
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 2. invitation_tokens ─────────────────────────────────────
ALTER TABLE invitation_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invitation_tokens_all ON invitation_tokens;
CREATE POLICY invitation_tokens_all ON invitation_tokens
  FOR ALL TO authenticated
  USING (is_dg_or_above())
  WITH CHECK (is_dg_or_above());

DROP POLICY IF EXISTS invitation_tokens_service_all ON invitation_tokens;
CREATE POLICY invitation_tokens_service_all ON invitation_tokens
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 3. push_subscriptions ────────────────────────────────────
-- Note: user_id is TEXT (not UUID FK), so cast auth.uid()
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subs_select ON push_subscriptions;
CREATE POLICY push_subs_select ON push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS push_subs_insert ON push_subscriptions;
CREATE POLICY push_subs_insert ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS push_subs_update ON push_subscriptions;
CREATE POLICY push_subs_update ON push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS push_subs_delete ON push_subscriptions;
CREATE POLICY push_subs_delete ON push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS push_subs_service_all ON push_subscriptions;
CREATE POLICY push_subs_service_all ON push_subscriptions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 4. roles ─────────────────────────────────────────────────
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_select ON roles;
CREATE POLICY roles_select ON roles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS roles_insert ON roles;
CREATE POLICY roles_insert ON roles
  FOR INSERT TO authenticated
  WITH CHECK (is_dg_or_above());

DROP POLICY IF EXISTS roles_update ON roles;
CREATE POLICY roles_update ON roles
  FOR UPDATE TO authenticated
  USING (is_dg_or_above());

DROP POLICY IF EXISTS roles_delete ON roles;
CREATE POLICY roles_delete ON roles
  FOR DELETE TO authenticated
  USING (is_dg_or_above());

DROP POLICY IF EXISTS roles_service_all ON roles;
CREATE POLICY roles_service_all ON roles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 5. core_permissions ──────────────────────────────────────
ALTER TABLE core_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS core_perms_select ON core_permissions;
CREATE POLICY core_perms_select ON core_permissions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS core_perms_insert ON core_permissions;
CREATE POLICY core_perms_insert ON core_permissions
  FOR INSERT TO authenticated
  WITH CHECK (is_dg_or_above());

DROP POLICY IF EXISTS core_perms_update ON core_permissions;
CREATE POLICY core_perms_update ON core_permissions
  FOR UPDATE TO authenticated
  USING (is_dg_or_above());

DROP POLICY IF EXISTS core_perms_delete ON core_permissions;
CREATE POLICY core_perms_delete ON core_permissions
  FOR DELETE TO authenticated
  USING (is_dg_or_above());

DROP POLICY IF EXISTS core_perms_service_all ON core_permissions;
CREATE POLICY core_perms_service_all ON core_permissions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 6. role_permissions ──────────────────────────────────────
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_perms_select ON role_permissions;
CREATE POLICY role_perms_select ON role_permissions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS role_perms_insert ON role_permissions;
CREATE POLICY role_perms_insert ON role_permissions
  FOR INSERT TO authenticated
  WITH CHECK (is_dg_or_above());

DROP POLICY IF EXISTS role_perms_update ON role_permissions;
CREATE POLICY role_perms_update ON role_permissions
  FOR UPDATE TO authenticated
  USING (is_dg_or_above());

DROP POLICY IF EXISTS role_perms_delete ON role_permissions;
CREATE POLICY role_perms_delete ON role_permissions
  FOR DELETE TO authenticated
  USING (is_dg_or_above());

DROP POLICY IF EXISTS role_perms_service_all ON role_permissions;
CREATE POLICY role_perms_service_all ON role_permissions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 7. object_ownership ──────────────────────────────────────
ALTER TABLE object_ownership ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS obj_own_select ON object_ownership;
CREATE POLICY obj_own_select ON object_ownership
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR is_dg_or_above());

DROP POLICY IF EXISTS obj_own_insert ON object_ownership;
CREATE POLICY obj_own_insert ON object_ownership
  FOR INSERT TO authenticated
  WITH CHECK (is_dg_or_above());

DROP POLICY IF EXISTS obj_own_update ON object_ownership;
CREATE POLICY obj_own_update ON object_ownership
  FOR UPDATE TO authenticated
  USING (is_dg_or_above());

DROP POLICY IF EXISTS obj_own_delete ON object_ownership;
CREATE POLICY obj_own_delete ON object_ownership
  FOR DELETE TO authenticated
  USING (is_dg_or_above());

DROP POLICY IF EXISTS obj_own_service_all ON object_ownership;
CREATE POLICY obj_own_service_all ON object_ownership
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 8. object_access_grants ──────────────────────────────────
ALTER TABLE object_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS obj_grants_select ON object_access_grants;
CREATE POLICY obj_grants_select ON object_access_grants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_dg_or_above());

DROP POLICY IF EXISTS obj_grants_insert ON object_access_grants;
CREATE POLICY obj_grants_insert ON object_access_grants
  FOR INSERT TO authenticated
  WITH CHECK (is_dg_or_above());

DROP POLICY IF EXISTS obj_grants_update ON object_access_grants;
CREATE POLICY obj_grants_update ON object_access_grants
  FOR UPDATE TO authenticated
  USING (is_dg_or_above());

DROP POLICY IF EXISTS obj_grants_delete ON object_access_grants;
CREATE POLICY obj_grants_delete ON object_access_grants
  FOR DELETE TO authenticated
  USING (is_dg_or_above());

DROP POLICY IF EXISTS obj_grants_service_all ON object_access_grants;
CREATE POLICY obj_grants_service_all ON object_access_grants
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
