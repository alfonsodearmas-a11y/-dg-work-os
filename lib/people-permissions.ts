import { supabaseAdmin } from './db';
import type { Role, AccessLevel, ActionResult, RoleWithPermissions, ActivityLog, ObjectAccessGrant } from './people-types';
import { ROLE_HIERARCHY } from './people-types';

// ─── Pattern 1: Check role-based permission ─────────────────────────
export async function checkPermission(
  userId: string,
  permissionName: string
): Promise<boolean> {
  // Get user role
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (!user) return false;

  // Get role id
  const { data: role } = await supabaseAdmin
    .from('roles')
    .select('id')
    .eq('name', user.role)
    .single();

  if (!role) return false;

  // Check role_permissions
  const { data: perm } = await supabaseAdmin
    .from('role_permissions')
    .select('id, permission_id')
    .eq('role_id', role.id)
    .single();

  // More efficient: join through permission name
  const { count } = await supabaseAdmin
    .from('role_permissions')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', role.id)
    .in('permission_id', (
      await supabaseAdmin
        .from('core_permissions')
        .select('id')
        .eq('name', permissionName)
    ).data?.map(p => p.id) || []);

  if ((count || 0) > 0) return true;

  // Check delegated permissions
  const { count: delegatedCount } = await supabaseAdmin
    .from('delegated_permissions')
    .select('id', { count: 'exact', head: true })
    .eq('to_user_id', userId)
    .in('permission_id', (
      await supabaseAdmin
        .from('core_permissions')
        .select('id')
        .eq('name', permissionName)
    ).data?.map(p => p.id) || [])
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  return (delegatedCount || 0) > 0;
}

// ─── Optimized: batch check permissions for a role ───────────────────
export async function getPermissionsForRole(roleName: Role): Promise<string[]> {
  const { data: role } = await supabaseAdmin
    .from('roles')
    .select('id')
    .eq('name', roleName)
    .single();

  if (!role) return [];

  const { data } = await supabaseAdmin
    .from('role_permissions')
    .select('permission_id, core_permissions(name)')
    .eq('role_id', role.id);

  if (!data) return [];

  return data.map((rp: Record<string, unknown>) => {
    const cp = rp.core_permissions as { name: string } | null;
    return cp?.name || '';
  }).filter(Boolean);
}

// ─── Pattern 2: Check object-level access ────────────────────────────
export async function checkObjectAccess(
  userId: string,
  objectType: string,
  objectId: string,
  requiredLevel: AccessLevel
): Promise<boolean> {
  const levelRank: Record<AccessLevel, number> = { view: 1, edit: 2, manage: 3 };
  const requiredRank = levelRank[requiredLevel];

  // Get user role for hierarchy check
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (!user) return false;

  // DG and minister always have full access
  if (ROLE_HIERARCHY[user.role as Role] >= 5) return true;

  // Check ownership
  const { data: ownership } = await supabaseAdmin
    .from('object_ownership')
    .select('id')
    .eq('object_type', objectType)
    .eq('object_id', objectId)
    .eq('owner_user_id', userId)
    .maybeSingle();

  if (ownership) return true;

  // Check explicit grants
  const { data: grant } = await supabaseAdmin
    .from('object_access_grants')
    .select('access_level')
    .eq('user_id', userId)
    .eq('object_type', objectType)
    .eq('object_id', objectId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();

  if (grant && levelRank[grant.access_level as AccessLevel] >= requiredRank) return true;

  // Check blanket grants (object_id is null = access to all of that type)
  const { data: blanketGrant } = await supabaseAdmin
    .from('object_access_grants')
    .select('access_level')
    .eq('user_id', userId)
    .eq('object_type', objectType)
    .is('object_id', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();

  if (blanketGrant && levelRank[blanketGrant.access_level as AccessLevel] >= requiredRank) return true;

  return false;
}

// ─── Pattern 3: Log activity ─────────────────────────────────────────
export async function logActivity(params: {
  userId: string;
  action: string;
  objectType?: string;
  objectId?: string;
  objectName?: string;
  changes?: Record<string, unknown>;
  reason?: string;
  result: ActionResult;
  denialReason?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await supabaseAdmin.from('activity_logs').insert({
    user_id: params.userId,
    action: params.action,
    object_type: params.objectType || null,
    object_id: params.objectId || null,
    object_name: params.objectName || null,
    changes: params.changes || null,
    reason: params.reason || null,
    result: params.result,
    denial_reason: params.denialReason || null,
    ip_address: params.ipAddress || null,
    user_agent: params.userAgent || null,
  });
}

// ─── Pattern 4: Grant object access ─────────────────────────────────
export async function grantObjectAccess(params: {
  granterId: string;
  targetUserId: string;
  objectType: string;
  objectId: string | null;
  accessLevel: AccessLevel;
  reason?: string;
  expiresAt?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabaseAdmin
    .from('object_access_grants')
    .upsert({
      user_id: params.targetUserId,
      object_type: params.objectType,
      object_id: params.objectId,
      access_level: params.accessLevel,
      reason: params.reason || null,
      granted_by: params.granterId,
      granted_at: new Date().toISOString(),
      expires_at: params.expiresAt || null,
    }, {
      onConflict: 'user_id,object_type,object_id',
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  await logActivity({
    userId: params.granterId,
    action: 'grant_access',
    objectType: params.objectType,
    objectId: params.objectId || undefined,
    changes: {
      target_user_id: params.targetUserId,
      access_level: params.accessLevel,
    },
    reason: params.reason,
    result: 'success',
  });

  return { success: true };
}

// ─── Pattern 5: Set object ownership ─────────────────────────────────
export async function setObjectOwnership(
  objectType: string,
  objectId: string,
  ownerUserId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from('object_ownership')
    .upsert({
      object_type: objectType,
      object_id: objectId,
      owner_user_id: ownerUserId,
    }, {
      onConflict: 'object_type,object_id',
    });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── Pattern 6: Delegate permission ──────────────────────────────────
export async function delegatePermission(params: {
  fromUserId: string;
  toUserId: string;
  permissionName: string;
  expiresAt?: string;
}): Promise<{ success: boolean; error?: string }> {
  // Verify the granter has the permission
  const hasPermission = await checkPermission(params.fromUserId, params.permissionName);
  if (!hasPermission) {
    return { success: false, error: 'You do not have this permission to delegate' };
  }

  // Get permission id
  const { data: perm } = await supabaseAdmin
    .from('core_permissions')
    .select('id')
    .eq('name', params.permissionName)
    .single();

  if (!perm) return { success: false, error: 'Permission not found' };

  const { error } = await supabaseAdmin
    .from('delegated_permissions')
    .upsert({
      from_user_id: params.fromUserId,
      to_user_id: params.toUserId,
      permission_id: perm.id,
      expires_at: params.expiresAt || null,
    }, {
      onConflict: 'from_user_id,to_user_id,permission_id',
    });

  if (error) return { success: false, error: error.message };

  await logActivity({
    userId: params.fromUserId,
    action: 'delegate_permission',
    objectType: 'permission',
    objectId: perm.id,
    objectName: params.permissionName,
    changes: { to_user_id: params.toUserId, expires_at: params.expiresAt },
    result: 'success',
  });

  return { success: true };
}

// ─── Pattern 7: Get user's accessible objects ────────────────────────
export async function getUserAccessibleObjects(
  userId: string,
  objectType: string
): Promise<string[]> {
  const now = new Date().toISOString();

  // Owned objects
  const { data: owned } = await supabaseAdmin
    .from('object_ownership')
    .select('object_id')
    .eq('owner_user_id', userId)
    .eq('object_type', objectType);

  // Granted objects
  const { data: granted } = await supabaseAdmin
    .from('object_access_grants')
    .select('object_id')
    .eq('user_id', userId)
    .eq('object_type', objectType)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  const ids = new Set<string>();
  owned?.forEach(o => ids.add(o.object_id));
  granted?.forEach(g => { if (g.object_id) ids.add(g.object_id); });

  return Array.from(ids);
}

// ─── Pattern 8: Can manage user (hierarchy check) ────────────────────
export function canManageUser(
  actorRole: Role,
  targetRole: Role
): boolean {
  return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole];
}

// ─── Pattern 9: Object activity trail ────────────────────────────────
export async function getObjectActivityTrail(
  objectType: string,
  objectId: string,
  limit = 50
): Promise<ActivityLog[]> {
  const { data } = await supabaseAdmin
    .from('activity_logs')
    .select('*, users!activity_logs_user_id_fkey(name)')
    .eq('object_type', objectType)
    .eq('object_id', objectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!data) return [];

  return data.map((row: Record<string, unknown>) => {
    const user = row.users as { name: string } | null;
    return {
      ...row,
      user_name: user?.name || 'Unknown',
      users: undefined,
    } as unknown as ActivityLog;
  });
}

// ─── Pattern 10: User activity log ───────────────────────────────────
export async function getUserActivityLog(
  userId: string,
  limit = 50,
  offset = 0
): Promise<ActivityLog[]> {
  const { data } = await supabaseAdmin
    .from('activity_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  return (data || []) as ActivityLog[];
}

// ─── Get all roles with permissions ──────────────────────────────────
export async function getRolesWithPermissions(): Promise<RoleWithPermissions[]> {
  const { data: roles } = await supabaseAdmin
    .from('roles')
    .select('*')
    .order('hierarchy_level', { ascending: false });

  if (!roles) return [];

  const result: RoleWithPermissions[] = [];

  for (const role of roles) {
    const { data: rps } = await supabaseAdmin
      .from('role_permissions')
      .select('core_permissions(*)')
      .eq('role_id', role.id);

    const permissions = (rps || []).map((rp: Record<string, unknown>) => {
      return rp.core_permissions as unknown;
    }).filter(Boolean);

    result.push({
      ...role,
      permissions,
    } as RoleWithPermissions);
  }

  return result;
}

// ─── Get all core permissions ────────────────────────────────────────
export async function getAllPermissions() {
  const { data } = await supabaseAdmin
    .from('core_permissions')
    .select('*')
    .order('resource')
    .order('action');

  return data || [];
}

// ─── Get grants for an object ────────────────────────────────────────
export async function getObjectGrants(
  objectType: string,
  objectId?: string
): Promise<(ObjectAccessGrant & { user_name: string; user_email: string })[]> {
  let query = supabaseAdmin
    .from('object_access_grants')
    .select('*, users!object_access_grants_user_id_fkey(name, email)')
    .eq('object_type', objectType);

  if (objectId) {
    query = query.eq('object_id', objectId);
  }

  const { data } = await query.order('granted_at', { ascending: false });

  if (!data) return [];

  return data.map((row: Record<string, unknown>) => {
    const user = row.users as { name: string; email: string } | null;
    return {
      ...row,
      user_name: user?.name || 'Unknown',
      user_email: user?.email || '',
      users: undefined,
    } as unknown as ObjectAccessGrant & { user_name: string; user_email: string };
  });
}

// ─── Revoke object access ────────────────────────────────────────────
export async function revokeObjectAccess(
  grantId: string,
  revokedByUserId: string
): Promise<{ success: boolean; error?: string }> {
  const { data: grant } = await supabaseAdmin
    .from('object_access_grants')
    .select('*')
    .eq('id', grantId)
    .single();

  if (!grant) return { success: false, error: 'Grant not found' };

  const { error } = await supabaseAdmin
    .from('object_access_grants')
    .delete()
    .eq('id', grantId);

  if (error) return { success: false, error: error.message };

  await logActivity({
    userId: revokedByUserId,
    action: 'revoke_access',
    objectType: grant.object_type,
    objectId: grant.object_id || undefined,
    changes: {
      target_user_id: grant.user_id,
      access_level: grant.access_level,
    },
    result: 'success',
  });

  return { success: true };
}
