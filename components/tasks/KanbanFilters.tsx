'use client';

import {
  Search, X, User, SlidersHorizontal, ArrowUpDown,
  LayoutGrid, List, Zap, Plus, RefreshCw, Maximize2, Minimize2,
} from 'lucide-react';
import type { Dispatch } from 'react';
import type {
  BoardAction, BoardState, DueDateFilter,
} from '@/hooks/useBoardReducer';
import type { SortField } from '@/components/tasks/TaskListView';
import { useSidebar } from '@/components/layout/SidebarContext';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENCIES = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'HAS', 'Hinterland', 'Ministry'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

// ---------------------------------------------------------------------------
// Filter pill helpers
// ---------------------------------------------------------------------------

export interface FilterPill {
  label: string;
  onClear: () => void;
}

export function buildFilterPills(state: BoardState, dispatch: Dispatch<BoardAction>): FilterPill[] {
  const pills: FilterPill[] = [];
  for (const a of state.agencyFilter) {
    pills.push({
      label: `Agency: ${a}`,
      onClear: () => dispatch({ type: 'TOGGLE_AGENCY_FILTER', agency: a }),
    });
  }
  for (const p of state.priorityFilter) {
    pills.push({
      label: `Priority: ${p}`,
      onClear: () => dispatch({ type: 'TOGGLE_PRIORITY_FILTER', priority: p }),
    });
  }
  for (const s of state.statusFilter) {
    pills.push({
      label: `Status: ${s}`,
      onClear: () => dispatch({ type: 'TOGGLE_STATUS_FILTER', status: s }),
    });
  }
  if (state.dueDateFilter !== 'any') {
    pills.push({
      label: `Due: ${state.dueDateFilter.replace('_', ' ')}`,
      onClear: () => dispatch({ type: 'SET_DUE_DATE_FILTER', filter: 'any' }),
    });
  }
  if (state.assigneeFilter) {
    const userName = state.users.find(u => u.id === state.assigneeFilter)?.name || 'Unknown';
    pills.push({
      label: `Assignee: ${userName}`,
      onClear: () => dispatch({ type: 'SET_ASSIGNEE_FILTER', assignee: null }),
    });
  }
  return pills;
}

export function hasActiveFilters(state: BoardState): boolean {
  return !!(
    state.searchQuery ||
    state.agencyFilter.length > 0 ||
    state.priorityFilter.length > 0 ||
    state.myTasksOnly ||
    state.assigneeFilter ||
    state.dueDateFilter !== 'any' ||
    state.statusFilter.length > 0
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

interface KanbanToolbarProps {
  state: BoardState;
  dispatch: Dispatch<BoardAction>;
  isMobile: boolean;
  onGenerateStandup: () => void;
  onRefresh: () => void;
}

export function KanbanToolbar({
  state,
  dispatch,
  isMobile,
  onGenerateStandup,
  onRefresh,
}: KanbanToolbarProps) {
  const active = hasActiveFilters(state);

  return (
    <div className="flex flex-wrap items-center gap-2 md:gap-3">
      {/* View Toggle */}
      <div className="flex rounded-lg border border-navy-800 overflow-hidden">
        <button
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'board' })}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
            state.viewMode === 'board'
              ? 'bg-navy-800 text-white'
              : 'bg-navy-900 text-navy-600 hover:text-slate-400'
          }`}
          style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
          aria-label="Board view"
        >
          <LayoutGrid className="h-4 w-4" />
          {!isMobile && 'Board'}
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'list' })}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
            state.viewMode === 'list'
              ? 'bg-navy-800 text-white'
              : 'bg-navy-900 text-navy-600 hover:text-slate-400'
          }`}
          style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
          aria-label="List view"
        >
          <List className="h-4 w-4" />
          {!isMobile && 'List'}
        </button>
      </div>

      {/* Search */}
      <div className="relative flex-1 min-w-[140px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-600" />
        <input
          type="text"
          placeholder="Search tasks..."
          value={state.searchQuery}
          onChange={(e) => dispatch({ type: 'SET_SEARCH', query: e.target.value })}
          aria-label="Search tasks"
          className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-navy-900 border border-navy-800 text-white placeholder-navy-600 focus:outline-none focus:border-gold-500 transition-colors"
          style={{ minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 16 : undefined }}
        />
      </div>

      {/* My Tasks Toggle */}
      <button
        onClick={() => dispatch({ type: 'SET_MY_TASKS', myOnly: !state.myTasksOnly })}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
          state.myTasksOnly
            ? 'bg-gold-500/20 border-gold-500/50 text-gold-500'
            : 'bg-navy-900 border-navy-800 text-slate-400 hover:border-[#3d4a62]'
        }`}
        style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
      >
        <User className="h-4 w-4" />
        {!isMobile && 'My Tasks'}
      </button>

      {/* Filter Toggle */}
      <button
        onClick={() => dispatch({ type: 'SET_SHOW_FILTERS', show: !state.showFilters })}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
          active
            ? 'bg-gold-500/20 border-gold-500/50 text-gold-500'
            : 'bg-navy-900 border-navy-800 text-slate-400 hover:border-[#3d4a62]'
        }`}
        style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
      >
        <SlidersHorizontal className="h-4 w-4" />
        {!isMobile && 'Filters'}
      </button>

      {/* Sort */}
      <div className="relative">
        <button
          onClick={() => dispatch({ type: 'SET_SHOW_SORT_MENU', show: !state.showSortMenu })}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-navy-900 border-navy-800 text-slate-400 hover:border-[#3d4a62] transition-colors"
          style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
        >
          <ArrowUpDown className="h-4 w-4" />
          {!isMobile && 'Sort'}
        </button>
        {state.showSortMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => dispatch({ type: 'SET_SHOW_SORT_MENU', show: false })} />
            <div className="absolute top-full right-0 mt-1 z-50 rounded-xl bg-[#142238] border border-navy-800 shadow-xl py-1 min-w-[180px]">
              {([
                { field: 'due_date' as SortField, label: 'Due Date' },
                { field: 'priority' as SortField, label: 'Priority' },
                { field: 'created_at' as SortField, label: 'Created' },
                { field: 'owner_name' as SortField, label: 'Assignee' },
                { field: 'agency' as SortField, label: 'Agency' },
              ]).map(opt => (
                <button
                  key={opt.field}
                  onClick={() => {
                    dispatch({ type: 'TOGGLE_SORT', field: opt.field });
                    dispatch({ type: 'SET_SHOW_SORT_MENU', show: false });
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-left transition-colors ${
                    state.sortField === opt.field ? 'text-gold-500 bg-gold-500/5' : 'text-slate-200 hover:bg-navy-900'
                  }`}
                  style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                >
                  {opt.label}
                  {state.sortField === opt.field && (
                    <span className="text-xs text-gold-500">{state.sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Focus Mode + Standup (desktop only) */}
      {!isMobile && <FocusModeButton />}
      {!isMobile && (
        <button
          onClick={onGenerateStandup}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-navy-900 border border-navy-800 text-slate-400 hover:border-gold-500/50 hover:text-white transition-colors"
        >
          <Zap className="h-4 w-4" />
          Standup
        </button>
      )}

      {/* Add Task (desktop only) */}
      {!isMobile && (
        <button
          onClick={() => dispatch({ type: 'SET_SHOW_NEW_TASK', show: true })}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold-500 text-navy-950 font-medium hover:bg-[#c9a432] transition-colors"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Task
        </button>
      )}

      {/* Sync Button */}
      <button
        onClick={onRefresh}
        disabled={state.syncing}
        className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-navy-900 border border-navy-800 text-slate-400 hover:border-[#3d4a62] transition-colors disabled:opacity-50"
        style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
        aria-label="Refresh"
      >
        <RefreshCw className={`h-4 w-4 ${state.syncing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Focus Mode Button
// ---------------------------------------------------------------------------

function FocusModeButton() {
  const { focusMode, toggleFocusMode } = useSidebar();
  const Icon = focusMode ? Minimize2 : Maximize2;
  return (
    <button
      onClick={toggleFocusMode}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
        focusMode
          ? 'bg-gold-500/20 border-gold-500/50 text-gold-500'
          : 'bg-navy-900 border-navy-800 text-slate-400 hover:border-gold-500/50 hover:text-gold-500'
      }`}
      aria-label={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
      aria-pressed={focusMode}
      title={`Focus Mode (${navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+\\)`}
    >
      <Icon className="h-4 w-4" />
      {focusMode ? 'Exit Focus' : 'Focus'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Filter Pills Bar
// ---------------------------------------------------------------------------

interface KanbanFilterPillsProps {
  pills: FilterPill[];
  onClearAll: () => void;
}

export function KanbanFilterPills({ pills, onClearAll }: KanbanFilterPillsProps) {
  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pills.map((pill, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-gold-500/15 text-gold-500 border border-gold-500/30"
        >
          {pill.label}
          <button
            onClick={pill.onClear}
            className="hover:text-white transition-colors"
            style={{ touchAction: 'manipulation' }}
            aria-label={`Remove ${pill.label} filter`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="text-xs text-navy-600 hover:text-white transition-colors"
        style={{ touchAction: 'manipulation' }}
      >
        Clear all
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter Panel (expanded filter controls)
// ---------------------------------------------------------------------------

interface KanbanFilterPanelProps {
  state: BoardState;
  dispatch: Dispatch<BoardAction>;
  isMobile: boolean;
}

export function KanbanFilterPanel({ state, dispatch, isMobile }: KanbanFilterPanelProps) {
  if (!state.showFilters) return null;

  const active = hasActiveFilters(state);

  return (
    <div className="p-4 rounded-xl bg-navy-900 border border-navy-800 space-y-4">
      <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5'}`}>
        {/* Agency multi-select */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Agency</label>
          <div className="space-y-1 max-h-[160px] overflow-y-auto">
            {AGENCIES.map(a => (
              <label key={a} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-navy-950 cursor-pointer transition-colors" style={{ minHeight: isMobile ? 44 : undefined }}>
                <input
                  type="checkbox"
                  checked={state.agencyFilter.includes(a)}
                  onChange={() => dispatch({ type: 'TOGGLE_AGENCY_FILTER', agency: a })}
                  className="w-3.5 h-3.5 rounded border-navy-800 accent-gold-500"
                />
                <span className="text-sm text-slate-200">{a}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Assignee */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Assignee</label>
          <select
            value={state.assigneeFilter || ''}
            onChange={(e) => dispatch({ type: 'SET_ASSIGNEE_FILTER', assignee: e.target.value || null })}
            aria-label="Assignee"
            className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-navy-800 text-white text-sm focus:outline-none focus:border-gold-500"
            style={{ minHeight: isMobile ? 44 : undefined }}
          >
            <option value="">All</option>
            {state.users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        {/* Priority multi-select */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Priority</label>
          <div className="space-y-1">
            {PRIORITIES.map(p => (
              <label key={p} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-navy-950 cursor-pointer transition-colors" style={{ minHeight: isMobile ? 44 : undefined }}>
                <input
                  type="checkbox"
                  checked={state.priorityFilter.includes(p)}
                  onChange={() => dispatch({ type: 'TOGGLE_PRIORITY_FILTER', priority: p })}
                  className="w-3.5 h-3.5 rounded border-navy-800 accent-gold-500"
                />
                <span className="text-sm text-slate-200 capitalize">{p}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Due Date filter */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Due Date</label>
          <div className="space-y-1">
            {([
              { value: 'any' as DueDateFilter, label: 'Any' },
              { value: 'overdue' as DueDateFilter, label: 'Overdue' },
              { value: 'this_week' as DueDateFilter, label: 'This week' },
              { value: 'this_month' as DueDateFilter, label: 'This month' },
            ]).map(opt => (
              <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-navy-950 cursor-pointer transition-colors" style={{ minHeight: isMobile ? 44 : undefined }}>
                <input
                  type="radio"
                  name="dueDateFilter"
                  checked={state.dueDateFilter === opt.value}
                  onChange={() => dispatch({ type: 'SET_DUE_DATE_FILTER', filter: opt.value })}
                  className="w-3.5 h-3.5 accent-gold-500"
                />
                <span className="text-sm text-slate-200">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Status filter */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Status</label>
          <div className="space-y-1">
            {(['new', 'active', 'blocked', 'done'] as const).map(s => (
              <label key={s} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-navy-950 cursor-pointer transition-colors" style={{ minHeight: isMobile ? 44 : undefined }}>
                <input
                  type="checkbox"
                  checked={state.statusFilter.includes(s)}
                  onChange={() => dispatch({ type: 'TOGGLE_STATUS_FILTER', status: s })}
                  className="w-3.5 h-3.5 rounded border-navy-800 accent-gold-500"
                />
                <span className="text-sm text-slate-200 capitalize">{s}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-navy-800">
        {active && (
          <button
            onClick={() => dispatch({ type: 'CLEAR_ALL_FILTERS' })}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gold-500 hover:bg-gold-500/10 transition-colors"
            style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
        <button
          onClick={() => dispatch({ type: 'SET_SHOW_FILTERS', show: false })}
          className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white bg-navy-950 border border-navy-800 transition-colors ml-auto"
          style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
