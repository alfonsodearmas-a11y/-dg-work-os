'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { ShieldOff, Lock } from 'lucide-react';

/**
 * Maps URL paths to module slugs.
 * Order matters — more specific paths must come first.
 */
const ROUTE_MODULE_MAP: [string, string][] = [
  ['/intel/gpl', 'gpl-deep-dive'],
  ['/intel/cjia', 'cjia-deep-dive'],
  ['/intel/gwi', 'gwi-deep-dive'],
  ['/intel/gcaa', 'gcaa-deep-dive'],
  ['/intel/heci', 'agency-intel'],
  ['/intel/marad', 'agency-intel'],
  ['/intel', 'agency-intel'],
  ['/tasks', 'tasks'],
  ['/oversight', 'oversight'],
  ['/budget', 'budget'],
  ['/meetings', 'meetings'],
  ['/calendar', 'calendar'],
  ['/documents', 'documents'],
  ['/applications', 'applications'],
  ['/procurement', 'procurement'],
  ['/projects', 'projects'],
  ['/airstrips', 'airstrips'],
  ['/pulse/gpl/grid-health', 'grid-health'],
  ['/admin/people', 'people'],
  ['/admin', 'settings'],
];

function getModuleForPath(pathname: string): string | null {
  // Home page — briefing module
  if (pathname === '/') return 'briefing';
  for (const [path, slug] of ROUTE_MODULE_MAP) {
    if (pathname === path || pathname.startsWith(path + '/')) {
      return slug;
    }
  }
  return null;
}

interface ModuleGateProps {
  children: React.ReactNode;
  mode?: 'view' | 'edit';
}

export function ModuleGate({ children, mode = 'view' }: ModuleGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { canAccess, canEdit, loading } = useModuleAccess();
  const [denied, setDenied] = useState(false);
  const [editDenied, setEditDenied] = useState(false);

  const moduleSlug = getModuleForPath(pathname);

  useEffect(() => {
    if (loading || !moduleSlug) {
      setDenied(false);
      setEditDenied(false);
      return;
    }

    if (!canAccess(moduleSlug)) {
      setDenied(true);
      setEditDenied(false);
      // Redirect after showing message briefly
      const timer = setTimeout(() => {
        router.replace('/');
      }, 2500);
      return () => clearTimeout(timer);
    } else if (mode === 'edit' && !canEdit(moduleSlug)) {
      setDenied(false);
      setEditDenied(true);
      // Redirect after showing message briefly
      const timer = setTimeout(() => {
        router.replace('/');
      }, 2500);
      return () => clearTimeout(timer);
    } else {
      setDenied(false);
      setEditDenied(false);
    }
  }, [loading, moduleSlug, canAccess, canEdit, mode, router]);

  if (denied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <ShieldOff className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-navy-600 text-sm max-w-md">
          You don&apos;t have access to this module. Contact the Director General to request access.
        </p>
        <p className="text-navy-700 text-xs mt-4">Redirecting to home...</p>
      </div>
    );
  }

  if (editDenied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
          <Lock className="h-8 w-8 text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">View-Only Access</h2>
        <p className="text-navy-600 text-sm max-w-md">
          You have view-only access to this module. Contact the Director General for edit permissions.
        </p>
        <p className="text-navy-700 text-xs mt-4">Redirecting to home...</p>
      </div>
    );
  }

  return <>{children}</>;
}

/** Wraps content that requires edit access to the current module */
export function ModuleEditGate({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { canAccess, canEdit, loading } = useModuleAccess();

  const moduleSlug = getModuleForPath(pathname);

  // While loading, don't render edit-gated content (safer default)
  if (loading) return null;

  // No module slug for this route — render children (no gating)
  if (!moduleSlug) return <>{children}</>;

  // If user has no view access at all, render nothing
  // (the parent ModuleGate will handle the redirect)
  if (!canAccess(moduleSlug)) return null;

  // If user can view but not edit, render fallback or nothing
  if (!canEdit(moduleSlug)) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}
