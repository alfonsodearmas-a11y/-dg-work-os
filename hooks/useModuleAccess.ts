'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from '@/components/providers/SupabaseSessionProvider';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';

interface ModulePermissions {
  canView: boolean;
  canEdit: boolean;
}

interface ModuleAccessState {
  modules: string[];
  permissions: Record<string, ModulePermissions>;
  loading: boolean;
  canAccess: (slug: string) => boolean;
  canEdit: (slug: string) => boolean;
  refresh: () => void;
}

export function useModuleAccess(): ModuleAccessState {
  const { status } = useSession();
  const { effectiveUser } = useEffectiveUser();
  const [modules, setModules] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Record<string, ModulePermissions>>({});
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const userRole = effectiveUser.role;

  const fetchModules = useCallback(async () => {
    if (status !== 'authenticated') return;
    try {
      const res = await fetch('/api/modules/my-access');
      if (res.ok) {
        const data = await res.json();
        setModules(data.modules || []);
        setPermissions(data.permissions || {});
      }
    } catch {
      // fail silently — will show all modules for DG, none for others
    }
    setLoading(false);
  }, [status]);

  useEffect(() => {
    if (status === 'authenticated' && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchModules();
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status, fetchModules]);

  const canAccess = useCallback(
    (slug: string) => {
      // Ministry roles always have full access (client-side optimistic check)
      if (userRole === 'superadmin') return true;
      // While loading, optimistically allow access (server will enforce)
      if (loading) return true;
      return modules.includes(slug);
    },
    [modules, loading, userRole]
  );

  const canEdit = useCallback(
    (slug: string) => {
      // Ministry roles always have full access
      if (userRole === 'superadmin') return true;
      // While loading, optimistically deny edit access (safer default)
      if (loading) return false;
      return permissions[slug]?.canEdit === true;
    },
    [permissions, loading, userRole]
  );

  const refresh = useCallback(() => {
    fetchedRef.current = false;
    setLoading(true);
    fetchModules();
  }, [fetchModules]);

  return { modules, permissions, loading, canAccess, canEdit, refresh };
}
