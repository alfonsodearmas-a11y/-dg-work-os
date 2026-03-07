'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import type { TeamMember, ActivityLog, ObjectAccessGrant, RoleWithPermissions, CorePermission } from '@/lib/people-types';

// ─── usePermission ───────────────────────────────────────────────────
export function usePermission(permissionName: string) {
  const { data: session } = useSession();
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }

    fetch('/api/people/permissions')
      .then(res => res.json())
      .then(data => {
        const perms: string[] = data.myPermissions || [];
        setHasPermission(perms.includes(permissionName));
      })
      .catch(() => setHasPermission(false))
      .finally(() => setLoading(false));
  }, [session?.user?.id, permissionName]);

  return { hasPermission, loading };
}

// ─── usePermissions (batch) ──────────────────────────────────────────
export function usePermissions() {
  const { data: session } = useSession();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [allPermissions, setAllPermissions] = useState<CorePermission[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!session?.user?.id) return;
    setLoading(true);
    fetch('/api/people/permissions')
      .then(res => res.json())
      .then(data => {
        setPermissions(data.myPermissions || []);
        setRoles(data.roles || []);
        setAllPermissions(data.permissions || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const hasPermission = useCallback(
    (name: string) => permissions.includes(name),
    [permissions]
  );

  return { permissions, roles, allPermissions, hasPermission, loading, refresh };
}

// ─── useTeamMembers ──────────────────────────────────────────────────
export function useTeamMembers() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/people/team-members');
      const data = await res.json();
      if (res.ok) {
        setMembers(data.members || []);
        setError(null);
      } else {
        setError(data.error || 'Failed to load team members');
      }
    } catch {
      setError('Failed to load team members');
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { members, loading, error, refresh };
}

// ─── useInviteTeamMember ─────────────────────────────────────────────
export function useInviteTeamMember() {
  const [inviting, setInviting] = useState(false);

  const invite = async (data: {
    name: string;
    email: string;
    role: string;
    agency?: string | null;
  }): Promise<{ success: boolean; error?: string }> => {
    setInviting(true);
    try {
      const res = await fetch('/api/people/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.ok) return { success: true };
      return { success: false, error: result.error || 'Failed to invite' };
    } catch {
      return { success: false, error: 'Network error' };
    } finally {
      setInviting(false);
    }
  };

  return { invite, inviting };
}

// ─── useActivityLog ──────────────────────────────────────────────────
export function useActivityLog(filters?: {
  userId?: string;
  objectType?: string;
  objectId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters?.userId) params.set('userId', filters.userId);
    if (filters?.objectType) params.set('objectType', filters.objectType);
    if (filters?.objectId) params.set('objectId', filters.objectId);
    if (filters?.action) params.set('action', filters.action);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));

    try {
      const res = await fetch(`/api/people/activity?${params}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch {
      setLogs([]);
    }
    setLoading(false);
  }, [filters?.userId, filters?.objectType, filters?.objectId, filters?.action, filters?.limit, filters?.offset]);

  useEffect(() => { refresh(); }, [refresh]);

  return { logs, loading, refresh };
}

// ─── useObjectAccess ─────────────────────────────────────────────────
export function useObjectAccess(objectType: string, objectId?: string) {
  const [grants, setGrants] = useState<(ObjectAccessGrant & { user_name: string; user_email: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ objectType });
    if (objectId) params.set('objectId', objectId);

    try {
      const res = await fetch(`/api/people/access?${params}`);
      const data = await res.json();
      setGrants(data.grants || []);
    } catch {
      setGrants([]);
    }
    setLoading(false);
  }, [objectType, objectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const grant = async (data: {
    targetUserId: string;
    accessLevel: string;
    reason?: string;
  }) => {
    const res = await fetch('/api/people/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        objectType,
        objectId: objectId || null,
      }),
    });
    const result = await res.json();
    if (res.ok) {
      await refresh();
      return { success: true };
    }
    return { success: false, error: result.error };
  };

  const revoke = async (grantId: string) => {
    const res = await fetch(`/api/people/access?grantId=${grantId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      await refresh();
      return { success: true };
    }
    const result = await res.json();
    return { success: false, error: result.error };
  };

  return { grants, loading, refresh, grant, revoke };
}

// ─── Protected component ────────────────────────────────────────────
export function ProtectedByPermission({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { hasPermission, loading } = usePermission(permission);
  if (loading) return null;
  if (!hasPermission) return <>{fallback}</>;
  return <>{children}</>;
}
