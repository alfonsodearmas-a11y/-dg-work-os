'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';

interface ModuleAccessState {
  modules: string[];
  loading: boolean;
  canAccess: (slug: string) => boolean;
  refresh: () => void;
}

export function useModuleAccess(): ModuleAccessState {
  const { data: session, status } = useSession();
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const userRole = (session?.user as { role?: string })?.role;

  const fetchModules = useCallback(async () => {
    if (status !== 'authenticated') return;
    try {
      const res = await fetch('/api/modules/my-access');
      if (res.ok) {
        const data = await res.json();
        setModules(data.modules || []);
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
      // DG always has access (client-side optimistic check)
      if (userRole === 'dg') return true;
      // While loading, optimistically allow access (server will enforce)
      if (loading) return true;
      return modules.includes(slug);
    },
    [modules, loading, userRole]
  );

  const refresh = useCallback(() => {
    fetchedRef.current = false;
    setLoading(true);
    fetchModules();
  }, [fetchModules]);

  return { modules, loading, canAccess, refresh };
}
