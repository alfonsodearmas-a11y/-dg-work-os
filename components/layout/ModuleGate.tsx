'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { ShieldOff } from 'lucide-react';

/**
 * Maps URL paths to module slugs.
 * Order matters — more specific paths must come first.
 */
const ROUTE_MODULE_MAP: [string, string][] = [
  ['/intel/gpl', 'gpl-deep-dive'],
  ['/intel/cjia', 'cjia-deep-dive'],
  ['/intel/gwi', 'gwi-deep-dive'],
  ['/intel/gcaa', 'gcaa-deep-dive'],
  ['/intel', 'agency-intel'],
  ['/tasks', 'tasks'],
  ['/oversight', 'oversight'],
  ['/budget', 'budget'],
  ['/meetings', 'meetings'],
  ['/calendar', 'calendar'],
  ['/documents', 'documents'],
  ['/applications', 'applications'],
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

export function ModuleGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { canAccess, loading } = useModuleAccess();
  const [denied, setDenied] = useState(false);

  const moduleSlug = getModuleForPath(pathname);

  useEffect(() => {
    if (loading || !moduleSlug) {
      setDenied(false);
      return;
    }

    if (!canAccess(moduleSlug)) {
      setDenied(true);
      // Redirect after showing message briefly
      const timer = setTimeout(() => {
        router.replace('/');
      }, 2500);
      return () => clearTimeout(timer);
    } else {
      setDenied(false);
    }
  }, [loading, moduleSlug, canAccess, router]);

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

  return <>{children}</>;
}
