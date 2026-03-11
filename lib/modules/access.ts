import { supabaseAdmin } from '@/lib/db';
import { auth, type Role } from '@/lib/auth';
import { NextResponse } from 'next/server';

export interface ModuleRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  default_roles: string[];
  is_active: boolean;
  sort_order: number;
}

/**
 * Get all modules the user can access.
 * DG always gets ALL active modules (hardcoded bypass).
 * Others get modules where their role is in default_roles OR there's an explicit grant.
 */
export async function getUserModules(userId: string, userRole: Role): Promise<string[]> {
  // DG sees everything active
  if (userRole === 'dg') {
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

  // Fetch explicit grants for this user
  const { data: grants } = await supabaseAdmin
    .from('user_module_access')
    .select('module_id')
    .eq('user_id', userId);

  const grantedModuleIds = new Set((grants || []).map((g: { module_id: string }) => g.module_id));

  // A user can access a module if:
  // (a) their role is in the module's default_roles, OR
  // (b) they have an explicit grant in user_module_access
  return allModules
    .filter((m: { id: string; slug: string; default_roles: string[] }) =>
      m.default_roles.includes(userRole) || grantedModuleIds.has(m.id)
    )
    .map((m: { slug: string }) => m.slug);
}

/**
 * Check if a specific user can access a specific module.
 */
export async function canAccessModule(userId: string, userRole: Role, moduleSlug: string): Promise<boolean> {
  if (userRole === 'dg') {
    // DG can access any active module
    const { data } = await supabaseAdmin
      .from('modules')
      .select('id')
      .eq('slug', moduleSlug)
      .eq('is_active', true)
      .single();
    return !!data;
  }

  // Check if module exists and is active
  const { data: mod } = await supabaseAdmin
    .from('modules')
    .select('id, default_roles')
    .eq('slug', moduleSlug)
    .eq('is_active', true)
    .single();

  if (!mod) return false;

  // Check default role access
  if ((mod.default_roles as string[]).includes(userRole)) return true;

  // Check explicit grant
  const { data: grant } = await supabaseAdmin
    .from('user_module_access')
    .select('id')
    .eq('user_id', userId)
    .eq('module_id', mod.id)
    .single();

  return !!grant;
}

/**
 * Require module access in an API route. Returns 403 if denied.
 */
export async function requireModuleAccess(moduleSlug: string) {
  const session = await auth(); // TODO: migrate to requireRole()

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
 * Get module access grants for a specific user.
 */
export async function getUserModuleGrants(userId: string): Promise<string[]> {
  const { data: grants } = await supabaseAdmin
    .from('user_module_access')
    .select('module_id, modules!inner(slug)')
    .eq('user_id', userId);

  return (grants || []).map((g: Record<string, unknown>) => {
    const mod = g.modules as { slug: string } | { slug: string }[];
    return Array.isArray(mod) ? mod[0]?.slug : mod?.slug;
  }).filter(Boolean) as string[];
}

/**
 * Grant module access to a user.
 */
export async function grantModuleAccess(userId: string, moduleSlug: string, grantedBy: string): Promise<boolean> {
  // Get module ID
  const { data: mod } = await supabaseAdmin
    .from('modules')
    .select('id')
    .eq('slug', moduleSlug)
    .single();

  if (!mod) return false;

  const { error } = await supabaseAdmin
    .from('user_module_access')
    .upsert({
      user_id: userId,
      module_id: mod.id,
      granted_by: grantedBy,
      granted_at: new Date().toISOString(),
    }, { onConflict: 'user_id,module_id' });

  if (!error) {
    // Log to activity_logs
    await supabaseAdmin.from('activity_logs').insert({
      user_id: grantedBy,
      action: 'module_access_granted',
      object_type: 'module',
      object_id: mod.id,
      object_name: moduleSlug,
      changes: { user_id: userId, module: moduleSlug },
      result: 'success',
    });
  }

  return !error;
}

/**
 * Revoke module access from a user.
 */
export async function revokeModuleAccess(userId: string, moduleSlug: string, revokedBy: string): Promise<boolean> {
  const { data: mod } = await supabaseAdmin
    .from('modules')
    .select('id')
    .eq('slug', moduleSlug)
    .single();

  if (!mod) return false;

  const { error } = await supabaseAdmin
    .from('user_module_access')
    .delete()
    .eq('user_id', userId)
    .eq('module_id', mod.id);

  if (!error) {
    await supabaseAdmin.from('activity_logs').insert({
      user_id: revokedBy,
      action: 'module_access_revoked',
      object_type: 'module',
      object_id: mod.id,
      object_name: moduleSlug,
      changes: { user_id: userId, module: moduleSlug },
      result: 'success',
    });
  }

  return !error;
}
