import { supabaseAdmin } from '@/lib/db';
import { auth, type Role } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { ModuleRecord, ModuleOverride } from '@/lib/module-types';

export type { ModuleRecord, ModuleOverride };

const FULL_ACCESS_ROLES: Role[] = ['dg', 'minister', 'ps'];

/**
 * Look up a module by slug and determine if it's a role default for the given user.
 * Shared by grantModuleAccess and revokeModuleAccess.
 */
async function resolveModuleAndRole(userId: string, moduleSlug: string) {
  const { data: mod } = await supabaseAdmin
    .from('modules')
    .select('id, default_roles')
    .eq('slug', moduleSlug)
    .single();

  if (!mod) return null;

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  const role = (user as { role: string } | null)?.role;
  const isDefault = !!role && (mod.default_roles as string[]).includes(role);

  return { mod: mod as { id: string; default_roles: string[] }, isDefault };
}

/**
 * Get all modules the user can access.
 * Ministry roles (DG, Minister, PS) always get ALL active modules.
 * Others get modules where:
 *   - their role is in default_roles AND there is no 'deny' override, OR
 *   - there is an explicit 'grant' override
 */
export async function getUserModules(userId: string, userRole: Role): Promise<string[]> {
  // Ministry roles see everything active
  if (FULL_ACCESS_ROLES.includes(userRole)) {
    const { data } = await supabaseAdmin
      .from('modules')
      .select('slug')
      .eq('is_active', true)
      .order('sort_order');
    return (data || []).map((m: { slug: string }) => m.slug);
  }

  // Fetch all active modules
  const { data: allModules } = await supabaseAdmin
    .from('modules')
    .select('id, slug, default_roles')
    .eq('is_active', true)
    .order('sort_order');

  if (!allModules || allModules.length === 0) return [];

  // Fetch all overrides for this user (grants AND denials)
  const { data: overrides } = await supabaseAdmin
    .from('user_module_access')
    .select('module_id, access_type')
    .eq('user_id', userId);

  const overrideMap = new Map<string, string>();
  for (const o of (overrides || []) as { module_id: string; access_type: string }[]) {
    overrideMap.set(o.module_id, o.access_type);
  }

  return allModules
    .filter((m: { id: string; slug: string; default_roles: string[] }) => {
      const override = overrideMap.get(m.id);
      if (override === 'deny') return false;
      if (override === 'grant') return true;
      return m.default_roles.includes(userRole);
    })
    .map((m: { slug: string }) => m.slug);
}

/**
 * Check if a specific user can access a specific module.
 */
export async function canAccessModule(userId: string, userRole: Role, moduleSlug: string): Promise<boolean> {
  if (FULL_ACCESS_ROLES.includes(userRole)) {
    const { data } = await supabaseAdmin
      .from('modules')
      .select('id')
      .eq('slug', moduleSlug)
      .eq('is_active', true)
      .single();
    return !!data;
  }

  const { data: mod } = await supabaseAdmin
    .from('modules')
    .select('id, default_roles')
    .eq('slug', moduleSlug)
    .eq('is_active', true)
    .single();

  if (!mod) return false;

  const { data: override } = await supabaseAdmin
    .from('user_module_access')
    .select('access_type')
    .eq('user_id', userId)
    .eq('module_id', mod.id)
    .single();

  if (override) {
    return (override as { access_type: string }).access_type === 'grant';
  }

  return (mod.default_roles as string[]).includes(userRole);
}

/**
 * Require module access in an API route. Returns 403 if denied.
 */
export async function requireModuleAccess(moduleSlug: string) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const hasAccess = await canAccessModule(session.user.id, session.user.role, moduleSlug);
  if (!hasAccess) {
    return NextResponse.json({ error: "You don't have access to this module." }, { status: 403 });
  }

  return { session };
}

/**
 * Get all active modules (for admin UI).
 */
export async function getAllModules(): Promise<ModuleRecord[]> {
  const { data } = await supabaseAdmin
    .from('modules')
    .select('*')
    .order('sort_order');
  return (data || []) as ModuleRecord[];
}

/**
 * Get all module overrides for a user (both grants and denials).
 */
export async function getUserModuleOverrides(userId: string): Promise<ModuleOverride[]> {
  const { data } = await supabaseAdmin
    .from('user_module_access')
    .select('access_type, modules!inner(slug)')
    .eq('user_id', userId);

  return (data || []).map((row: Record<string, unknown>) => {
    const mod = row.modules as { slug: string } | { slug: string }[];
    const slug = Array.isArray(mod) ? mod[0]?.slug : mod?.slug;
    return { slug, access_type: row.access_type as 'grant' | 'deny' };
  }).filter((o: ModuleOverride) => o.slug) as ModuleOverride[];
}

/**
 * Grant module access to a user.
 * - If the module is a role default and has a 'deny' override, removes the denial.
 * - If the module is not a role default, upserts a 'grant' override.
 */
export async function grantModuleAccess(userId: string, moduleSlug: string, grantedBy: string): Promise<boolean> {
  const result = await resolveModuleAndRole(userId, moduleSlug);
  if (!result) return false;
  const { mod, isDefault } = result;

  if (isDefault) {
    await supabaseAdmin
      .from('user_module_access')
      .delete()
      .eq('user_id', userId)
      .eq('module_id', mod.id)
      .eq('access_type', 'deny');
  } else {
    const { error } = await supabaseAdmin
      .from('user_module_access')
      .upsert({
        user_id: userId,
        module_id: mod.id,
        granted_by: grantedBy,
        granted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        access_type: 'grant',
      }, { onConflict: 'user_id,module_id' });

    if (error) return false;
  }

  await supabaseAdmin.from('activity_logs').insert({
    user_id: grantedBy,
    action: 'module_access_granted',
    object_type: 'module',
    object_id: mod.id,
    object_name: moduleSlug,
    changes: { user_id: userId, module: moduleSlug },
    result: 'success',
  });

  return true;
}

/**
 * Revoke module access from a user.
 * - If the module is a role default, inserts a 'deny' override.
 * - If the module is not a role default, deletes any 'grant' override.
 */
export async function revokeModuleAccess(userId: string, moduleSlug: string, revokedBy: string): Promise<boolean> {
  const result = await resolveModuleAndRole(userId, moduleSlug);
  if (!result) return false;
  const { mod, isDefault } = result;

  if (isDefault) {
    const { error } = await supabaseAdmin
      .from('user_module_access')
      .upsert({
        user_id: userId,
        module_id: mod.id,
        granted_by: revokedBy,
        granted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        access_type: 'deny',
      }, { onConflict: 'user_id,module_id' });

    if (error) return false;
  } else {
    await supabaseAdmin
      .from('user_module_access')
      .delete()
      .eq('user_id', userId)
      .eq('module_id', mod.id);
  }

  await supabaseAdmin.from('activity_logs').insert({
    user_id: revokedBy,
    action: 'module_access_revoked',
    object_type: 'module',
    object_id: mod.id,
    object_name: moduleSlug,
    changes: { user_id: userId, module: moduleSlug },
    result: 'success',
  });

  return true;
}

/**
 * Reset all module overrides for a user back to role defaults.
 */
export async function resetUserModuleOverrides(userId: string, resetBy: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('user_module_access')
    .delete()
    .eq('user_id', userId);

  if (!error) {
    await supabaseAdmin.from('activity_logs').insert({
      user_id: resetBy,
      action: 'module_access_reset',
      object_type: 'user',
      object_id: userId,
      changes: { user_id: userId, action: 'reset_to_role_defaults' },
      result: 'success',
    });
  }

  return !error;
}
