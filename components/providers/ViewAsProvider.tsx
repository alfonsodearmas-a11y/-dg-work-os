'use client';

import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useSession } from '@/components/providers/SupabaseSessionProvider';

export interface ViewAsTarget {
  id: string;
  name: string | null;
  email: string;
  role: string;
  agency: string | null;
  title?: string | null;
  avatar_url?: string | null;
}

interface EffectiveUser {
  id: string;
  name: string;
  email: string;
  role: string;
  agency: string | null;
  title?: string | null;
  image?: string | null;
}

interface ViewAsContextValue {
  /** The real authenticated user (never changes) */
  realUser: EffectiveUser;
  /** The effective user for rendering/data decisions */
  effectiveUser: EffectiveUser;
  /** Whether View As mode is active */
  isViewingAs: boolean;
  /** The target user being viewed as (null if not active) */
  viewAsTarget: ViewAsTarget | null;
  /** Activate View As for a target user */
  startViewAs: (target: ViewAsTarget) => void;
  /** Deactivate View As and return to real user */
  stopViewAs: () => void;
}

const ViewAsContext = createContext<ViewAsContextValue | null>(null);

export function ViewAsProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [viewAsTarget, setViewAsTarget] = useState<ViewAsTarget | null>(null);

  const realUser = useMemo<EffectiveUser>(() => ({
    id: (session?.user as { id?: string })?.id || '',
    name: session?.user?.name || 'User',
    email: session?.user?.email || '',
    role: (session?.user as { role?: string })?.role || 'agency_manager',
    agency: (session?.user as { agency?: string | null })?.agency || null,
    title: (session?.user as { title?: string | null })?.title || null,
    image: session?.user?.image,
  }), [session]);

  const isViewingAs = viewAsTarget !== null;

  const effectiveUser = useMemo<EffectiveUser>(() => {
    if (!viewAsTarget) return realUser;
    return {
      // Keep real user's ID (auth identity stays real)
      id: realUser.id,
      // Show target user's identity for display
      name: viewAsTarget.name || viewAsTarget.email,
      email: viewAsTarget.email,
      role: viewAsTarget.role,
      agency: viewAsTarget.agency,
      title: viewAsTarget.title ?? null,
      image: viewAsTarget.avatar_url,
    };
  }, [realUser, viewAsTarget]);

  const startViewAs = useCallback((target: ViewAsTarget) => {
    // Don't view-as yourself
    if (target.id === realUser.id) return;
    // Only superadmins can use View As
    if (realUser.role !== 'superadmin') return;
    setViewAsTarget(target);
  }, [realUser.id, realUser.role]);

  const stopViewAs = useCallback(() => {
    setViewAsTarget(null);
  }, []);

  const value = useMemo<ViewAsContextValue>(() => ({
    realUser,
    effectiveUser,
    isViewingAs,
    viewAsTarget,
    startViewAs,
    stopViewAs,
  }), [realUser, effectiveUser, isViewingAs, viewAsTarget, startViewAs, stopViewAs]);

  return (
    <ViewAsContext.Provider value={value}>
      {children}
    </ViewAsContext.Provider>
  );
}

/**
 * Hook to get the effective user context.
 * Use effectiveUser.role and effectiveUser.agency for rendering/data decisions.
 * Use realUser for auth identity (mutations, API auth).
 */
export function useEffectiveUser() {
  const ctx = useContext(ViewAsContext);
  if (!ctx) {
    throw new Error('useEffectiveUser must be used within a ViewAsProvider');
  }
  return ctx;
}
