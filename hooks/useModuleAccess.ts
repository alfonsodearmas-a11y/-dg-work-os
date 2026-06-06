'use client';

import { useCallback, useMemo } from 'react';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
import { modulesForUser } from '@/lib/modules/role-modules';

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

const noop = () => {};

/**
 * Pure role-based module access — synchronous, no fetch, no loading state.
 * Role (+ agency) is the only determinant; resolves from the effective user,
 * so View As previews the target's module visibility.
 */
export function useModuleAccess(): ModuleAccessState {
  const { effectiveUser } = useEffectiveUser();

  const modules = useMemo(
    () => modulesForUser(effectiveUser.role, effectiveUser.agency),
    [effectiveUser.role, effectiveUser.agency],
  );

  const canAccess = useCallback((slug: string) => modules.includes(slug), [modules]);

  // Edit follows access — the per-user can_edit concept is gone.
  const permissions = useMemo(
    () => Object.fromEntries(modules.map(s => [s, { canView: true, canEdit: true }])),
    [modules],
  );

  return { modules, permissions, loading: false, canAccess, canEdit: canAccess, refresh: noop };
}
