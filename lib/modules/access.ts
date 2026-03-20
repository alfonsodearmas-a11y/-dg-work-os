import { supabaseAdmin } from '@/lib/db';
import { auth, type Role } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { ModuleRecord, ModuleOverride, ModuleOverrideDetailed, ModulePermission } from '@/lib/module-types';
import { MINISTRY_ROLES } from '@/lib/people-types';

export type { ModuleRecord, ModuleOverride, ModuleOverrideDetailed, ModulePermission };

const FULL_ACCESS_ROLES: readonly string[] = MINISTRY_ROLES;

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
 * @param canEdit - Whether the user can edit (default false)
 * @param agency - Optional agency scope (null = all agencies)
 */
export async function grantModuleAccess(
  userId: string,
  moduleSlug: string,
  grantedBy: string,
  canEdit: boolean = false,
  agency: string | null = null,
): Promise<boolean> {
  const result = await resolveModuleAndRole(userId, moduleSlug);
  if (!result) return false;
  const { mod, isDefault } = result;

  if (isDefault && !canEdit && !agency) {
    // Role default with no special permissions — just remove any deny override
    await supabaseAdmin
      .from('user_module_access')
      .delete()
      .eq('user_id', userId)
      .eq('module_id', mod.id)
      .eq('access_type', 'deny');
  } else {
    // Select-then-insert/update pattern (unique index uses COALESCE on agency)
    let query = supabaseAdmin
      .from('user_module_access')
      .select('id')
      .eq('user_id', userId)
      .eq('module_id', mod.id);

    if (agency) {
      query = query.eq('agency', agency);
    } else {
      query = query.is('agency', null);
    }

    const { data: existing } = await query.maybeSingle();

    const now = new Date().toISOString();
    if (existing) {
      const { error } = await supabaseAdmin
        .from('user_module_access')
        .update({
          access_type: 'grant',
          can_edit: canEdit,
          agency,
          granted_by: grantedBy,
          updated_at: now,
        })
        .eq('id', existing.id);
      if (error) return false;
    } else {
      const { error } = await supabaseAdmin
        .from('user_module_access')
        .insert({
          user_id: userId,
          module_id: mod.id,
          granted_by: grantedBy,
          granted_at: now,
          updated_at: now,
          access_type: 'grant',
          can_edit: canEdit,
          agency,
        });
      if (error) return false;
    }
  }

  await supabaseAdmin.from('activity_logs').insert({
    user_id: grantedBy,
    action: 'module_access_granted',
    object_type: 'module',
    object_id: mod.id,
    object_name: moduleSlug,
    changes: { user_id: userId, module: moduleSlug, can_edit: canEdit, agency },
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
    // Select-then-insert/update pattern (unique index uses COALESCE on agency)
    const { data: existing } = await supabaseAdmin
      .from('user_module_access')
      .select('id')
      .eq('user_id', userId)
      .eq('module_id', mod.id)
      .is('agency', null)
      .maybeSingle();

    const now = new Date().toISOString();
    if (existing) {
      const { error } = await supabaseAdmin
        .from('user_module_access')
        .update({
          access_type: 'deny',
          can_edit: false,
          granted_by: revokedBy,
          updated_at: now,
        })
        .eq('id', existing.id);
      if (error) return false;
    } else {
      const { error } = await supabaseAdmin
        .from('user_module_access')
        .insert({
          user_id: userId,
          module_id: mod.id,
          granted_by: revokedBy,
          granted_at: now,
          updated_at: now,
          access_type: 'deny',
          can_edit: false,
        });
      if (error) return false;
    }
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

/**
 * Get detailed module overrides for a user, including can_edit and agency.
 */
export async function getUserModuleOverridesDetailed(userId: string): Promise<ModuleOverrideDetailed[]> {
  const { data } = await supabaseAdmin
    .from('user_module_access')
    .select('access_type, can_edit, agency, modules!inner(slug)')
    .eq('user_id', userId);

  return (data || []).map((row: Record<string, unknown>) => {
    const mod = row.modules as { slug: string } | { slug: string }[];
    const slug = Array.isArray(mod) ? mod[0]?.slug : mod?.slug;
    return {
      slug,
      access_type: row.access_type as 'grant' | 'deny',
      can_edit: row.can_edit as boolean,
      agency: (row.agency as string | null) ?? null,
    };
  }).filter((o: ModuleOverrideDetailed) => o.slug) as ModuleOverrideDetailed[];
}

/**
 * Get all module permissions for a user, keyed by module slug.
 * Ministry roles: all active modules with canView=true, canEdit=true.
 * Others: apply grant/deny logic and populate canEdit from override rows.
 * Default behavior: if role is in default_roles and no override -> canView=true, canEdit=false.
 * If override access_type='grant' -> canView=true, canEdit=row.can_edit.
 */
export async function getUserModulePermissions(
  userId: string,
  userRole: Role,
): Promise<Record<string, ModulePermission>> {
  const result: Record<string, ModulePermission> = {};

  // Ministry roles see everything with full edit access
  if (FULL_ACCESS_ROLES.includes(userRole)) {
    const { data } = await supabaseAdmin
      .from('modules')
      .select('slug')
      .eq('is_active', true)
      .order('sort_order');
    for (const m of (data || []) as { slug: string }[]) {
      result[m.slug] = { slug: m.slug, canView: true, canEdit: true };
    }
    return result;
  }

  // Fetch all active modules
  const { data: allModules } = await supabaseAdmin
    .from('modules')
    .select('id, slug, default_roles')
    .eq('is_active', true)
    .order('sort_order');

  if (!allModules || allModules.length === 0) return result;

  // Fetch all overrides for this user
  const { data: overrides } = await supabaseAdmin
    .from('user_module_access')
    .select('module_id, access_type, can_edit')
    .eq('user_id', userId);

  const overrideMap = new Map<string, { access_type: string; can_edit: boolean }>();
  for (const o of (overrides || []) as { module_id: string; access_type: string; can_edit: boolean }[]) {
    overrideMap.set(o.module_id, { access_type: o.access_type, can_edit: o.can_edit });
  }

  for (const m of allModules as { id: string; slug: string; default_roles: string[] }[]) {
    const override = overrideMap.get(m.id);
    if (override) {
      if (override.access_type === 'deny') {
        // Explicitly denied — no access
        continue;
      }
      // Explicit grant
      result[m.slug] = { slug: m.slug, canView: true, canEdit: override.can_edit };
    } else if (m.default_roles.includes(userRole)) {
      // Role default — view only, no edit
      result[m.slug] = { slug: m.slug, canView: true, canEdit: false };
    }
    // else: no access at all, not included
  }

  return result;
}

/**
 * Check if a user has edit access to a specific module.
 * Ministry roles always return true.
 */
export async function canEditModule(
  userId: string,
  userRole: Role,
  moduleSlug: string,
): Promise<boolean> {
  // Ministry roles always have edit access
  if (FULL_ACCESS_ROLES.includes(userRole)) return true;

  const { data: mod } = await supabaseAdmin
    .from('modules')
    .select('id')
    .eq('slug', moduleSlug)
    .eq('is_active', true)
    .single();

  if (!mod) return false;

  const { data: override } = await supabaseAdmin
    .from('user_module_access')
    .select('can_edit')
    .eq('user_id', userId)
    .eq('module_id', mod.id)
    .eq('access_type', 'grant')
    .maybeSingle();

  return !!(override as { can_edit: boolean } | null)?.can_edit;
}

/**
 * Bulk upsert module permissions for a user.
 * Deletes all existing overrides and inserts the new set.
 */
export async function bulkUpsertModulePermissions(
  userId: string,
  permissions: Array<{
    moduleSlug: string;
    accessType: 'grant' | 'deny';
    canEdit: boolean;
    agency?: string | null;
  }>,
  grantedBy: string,
): Promise<boolean> {
  // Resolve all module slugs to IDs
  const slugs = permissions.map((p) => p.moduleSlug);
  const { data: modules } = await supabaseAdmin
    .from('modules')
    .select('id, slug')
    .in('slug', slugs);

  if (!modules) return false;

  const slugToId = new Map<string, string>();
  for (const m of modules as { id: string; slug: string }[]) {
    slugToId.set(m.slug, m.id);
  }

  // Delete all existing overrides for this user
  const { error: deleteError } = await supabaseAdmin
    .from('user_module_access')
    .delete()
    .eq('user_id', userId);

  if (deleteError) return false;

  // Build insert rows
  const now = new Date().toISOString();
  const rows = permissions
    .filter((p) => slugToId.has(p.moduleSlug))
    .map((p) => ({
      user_id: userId,
      module_id: slugToId.get(p.moduleSlug)!,
      access_type: p.accessType,
      can_edit: p.canEdit,
      agency: p.agency ?? null,
      granted_by: grantedBy,
      granted_at: now,
      updated_at: now,
    }));

  if (rows.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from('user_module_access')
      .insert(rows);

    if (insertError) return false;
  }

  // Log the bulk operation
  await supabaseAdmin.from('activity_logs').insert({
    user_id: grantedBy,
    action: 'module_access_bulk_upsert',
    object_type: 'user',
    object_id: userId,
    changes: {
      user_id: userId,
      permissions_count: permissions.length,
      modules: permissions.map((p) => ({
        slug: p.moduleSlug,
        accessType: p.accessType,
        canEdit: p.canEdit,
        agency: p.agency ?? null,
      })),
    },
    result: 'success',
  });

  return true;
}
