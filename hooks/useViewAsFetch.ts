'use client';

import { useCallback } from 'react';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';

/**
 * Returns a function that appends viewAs query params to a URL when View As is active.
 * Use this to wrap fetch URLs so API routes receive the effective role/agency.
 *
 * Usage:
 *   const { withViewAs } = useViewAsFetch();
 *   const res = await fetch(withViewAs('/api/tasks'));
 */
export function useViewAsFetch() {
  const { isViewingAs, viewAsTarget } = useEffectiveUser();

  const withViewAs = useCallback((url: string): string => {
    if (!isViewingAs || !viewAsTarget) return url;

    const separator = url.includes('?') ? '&' : '?';
    const params = new URLSearchParams();
    if (viewAsTarget.role) params.set('viewAsRole', viewAsTarget.role);
    if (viewAsTarget.agency) params.set('viewAsAgency', viewAsTarget.agency);

    const paramStr = params.toString();
    return paramStr ? `${url}${separator}${paramStr}` : url;
  }, [isViewingAs, viewAsTarget]);

  return { withViewAs, isViewingAs };
}
