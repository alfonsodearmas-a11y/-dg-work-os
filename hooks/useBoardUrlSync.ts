'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { BoardState, BoardAction, ViewMode, DueDateFilter } from '@/hooks/useBoardReducer';
import type { SortField, SortDir } from '@/components/tasks/TaskListView';

/**
 * Two-way URL sync for the board reducer (D3).
 *
 * On mount: hydrates filter / sort / search / view / page state from
 * `useSearchParams()`. Subsequent state changes are flushed back to the URL
 * via `router.replace()` so refresh + share-link both restore the same view.
 *
 * Defaults are NOT written — the URL stays clean for the cold-start case.
 */
export function useBoardUrlSync(state: BoardState, dispatch: (a: BoardAction) => void) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydrated = useRef(false);

  // Hydrate on mount only.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    const status = searchParams.get('status')?.split(',').filter(Boolean) ?? [];
    for (const s of status) dispatch({ type: 'TOGGLE_STATUS_FILTER', status: s });

    const priority = searchParams.get('priority')?.split(',').filter(Boolean) ?? [];
    for (const p of priority) dispatch({ type: 'TOGGLE_PRIORITY_FILTER', priority: p });

    const agency = searchParams.get('agency')?.split(',').filter(Boolean) ?? [];
    for (const a of agency) dispatch({ type: 'TOGGLE_AGENCY_FILTER', agency: a });

    const assignee = searchParams.get('assignee');
    if (assignee) dispatch({ type: 'SET_ASSIGNEE_FILTER', assignee });

    const due = searchParams.get('due') as DueDateFilter | null;
    if (due && ['any', 'overdue', 'this_week', 'this_month'].includes(due)) {
      dispatch({ type: 'SET_DUE_DATE_FILTER', filter: due });
    }

    const q = searchParams.get('q');
    if (q) dispatch({ type: 'SET_SEARCH', query: q });

    if (searchParams.get('completed') === '1') {
      dispatch({ type: 'SET_SHOW_COMPLETED', show: true });
    }

    if (searchParams.get('mine') === '1') {
      dispatch({ type: 'SET_MY_TASKS', myOnly: true });
    }

    const sort = searchParams.get('sort') as SortField | null;
    if (sort) {
      // TOGGLE_SORT initializes to 'asc' on first set; we then apply explicit dir.
      dispatch({ type: 'TOGGLE_SORT', field: sort });
    }
    const dir = searchParams.get('dir') as SortDir | null;
    if (dir === 'desc' && sort) {
      // Toggle once more to flip from default 'asc' to 'desc' on the same field.
      dispatch({ type: 'TOGGLE_SORT', field: sort });
    }

    const view = searchParams.get('view') as ViewMode | null;
    if (view === 'list' || view === 'board') dispatch({ type: 'SET_VIEW_MODE', mode: view });

    const page = parseInt(searchParams.get('page') || '', 10);
    if (Number.isFinite(page) && page > 1) dispatch({ type: 'SET_LIST_PAGE', page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush state to URL whenever any synced slice changes.
  useEffect(() => {
    if (!hydrated.current) return;
    const params = new URLSearchParams();

    if (state.statusFilter.length) params.set('status', state.statusFilter.join(','));
    if (state.priorityFilter.length) params.set('priority', state.priorityFilter.join(','));
    if (state.agencyFilter.length) params.set('agency', state.agencyFilter.join(','));
    if (state.assigneeFilter) params.set('assignee', state.assigneeFilter);
    if (state.dueDateFilter !== 'any') params.set('due', state.dueDateFilter);
    if (state.searchQuery) params.set('q', state.searchQuery);
    if (state.showCompleted) params.set('completed', '1');
    if (state.myTasksOnly) params.set('mine', '1');
    if (state.sortField !== 'due_date') params.set('sort', state.sortField);
    if (state.sortDir !== 'asc') params.set('dir', state.sortDir);
    if (state.viewMode !== 'board') params.set('view', state.viewMode);
    if (state.listPage > 1) params.set('page', String(state.listPage));

    const qs = params.toString();
    const next = `${pathname}${qs ? `?${qs}` : ''}`;
    // Avoid redundant pushes — read the current URL via window since router has
    // no synchronous read API in app router.
    const current = `${window.location.pathname}${window.location.search}`;
    if (next !== current) {
      router.replace(next, { scroll: false });
    }
  }, [
    state.statusFilter,
    state.priorityFilter,
    state.agencyFilter,
    state.assigneeFilter,
    state.dueDateFilter,
    state.searchQuery,
    state.showCompleted,
    state.myTasksOnly,
    state.sortField,
    state.sortDir,
    state.viewMode,
    state.listPage,
    pathname,
    router,
  ]);
}
