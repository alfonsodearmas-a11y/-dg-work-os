'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ChevronUp, ChevronDown, Calendar } from 'lucide-react';
import {
  ProcurementPackage,
  ProcurementStage,
  PROCUREMENT_STAGES,
  METHOD_CONFIG,
} from '@/lib/procurement-types';
import { AgencyBadge } from './AgencyBadge';
import { ProcurementStageBadge } from './ProcurementStageBadge';
import { DaysAtStageIndicator } from './DaysAtStageIndicator';
import { ProcurementBulkBar } from './ProcurementBulkBar';
import { fmtDate, fmtRelativeTime } from '@/lib/format';
import { useIsMobile } from '@/hooks/useIsMobile';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type SortField =
  | 'title'
  | 'agency'
  | 'current_stage'
  | 'days_at_current_stage'
  | 'expected_delivery_date'
  | 'updated_at'
  | 'submitted_by_name';

type SortDir = 'asc' | 'desc';

const STAGE_ORDER = Object.fromEntries(
  PROCUREMENT_STAGES.map((s, i) => [s, i]),
) as Record<ProcurementStage, number>;

const PAGE_SIZE = 20;
const GRID_COLS = 'grid-cols-[40px_1fr_90px_120px_70px_100px_90px_90px]';

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function sortList(
  pkgs: ProcurementPackage[],
  field: SortField,
  dir: SortDir,
): ProcurementPackage[] {
  return [...pkgs].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
      case 'agency':
        cmp = a.agency.localeCompare(b.agency);
        break;
      case 'current_stage':
        cmp = STAGE_ORDER[a.current_stage] - STAGE_ORDER[b.current_stage];
        break;
      case 'days_at_current_stage':
        cmp = a.days_at_current_stage - b.days_at_current_stage;
        break;
      case 'expected_delivery_date': {
        const ad = a.expected_delivery_date || '9999-12-31';
        const bd = b.expected_delivery_date || '9999-12-31';
        cmp = ad.localeCompare(bd);
        break;
      }
      case 'updated_at':
        cmp = a.updated_at.localeCompare(b.updated_at);
        break;
      case 'submitted_by_name':
        cmp = (a.submitted_by_name || '').localeCompare(b.submitted_by_name || '');
        break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SortIcon({
  field,
  current,
  dir,
}: {
  field: SortField;
  current: SortField;
  dir: SortDir;
}) {
  if (field !== current) return null;
  return dir === 'asc' ? (
    <ChevronUp className="h-3 w-3 text-gold-500 transition-transform duration-200" />
  ) : (
    <ChevronDown className="h-3 w-3 text-gold-500 transition-transform duration-200" />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ProcurementListViewProps {
  packages: ProcurementPackage[];
  onSelect: (id: string) => void;
  onBulkAction?: () => void;
}

export function ProcurementListView({
  packages,
  onSelect,
  onBulkAction,
}: ProcurementListViewProps) {
  const isMobile = useIsMobile();
  const [sortField, setSortField] = useState<SortField>('days_at_current_stage');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  // -- Selection state (matches Task module pattern: Set<string>) --
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedRef = useRef<string | null>(null);
  const selectionMode = selectedIds.size > 0;

  // Reset page + clear selection when filtered data changes
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [packages]);

  // Escape to deselect (only attach when in selection mode)
  useEffect(() => {
    if (!selectionMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedIds(new Set());
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectionMode]);

  const sorted = useMemo(
    () => sortList(packages, sortField, sortDir),
    [packages, sortField, sortDir],
  );
  const sortedIds = useMemo(() => sorted.map((p) => p.id), [sorted]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages);
  const paginated = sorted.slice(
    (effectivePage - 1) * PAGE_SIZE,
    effectivePage * PAGE_SIZE,
  );

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(1);
  };

  // -- Selection handlers --
  const toggleSelect = useCallback((id: string, shiftKey?: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);

      // Shift-click range select
      if (shiftKey && lastSelectedRef.current) {
        const lastIdx = sortedIds.indexOf(lastSelectedRef.current);
        const curIdx = sortedIds.indexOf(id);
        if (lastIdx !== -1 && curIdx !== -1) {
          const start = Math.min(lastIdx, curIdx);
          const end = Math.max(lastIdx, curIdx);
          for (let i = start; i <= end; i++) {
            next.add(sortedIds[i]);
          }
          return next;
        }
      }

      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastSelectedRef.current = id;
  }, [sortedIds]);

  const toggleSelectAll = useCallback(() => {
    const pageIds = paginated.map((p) => p.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [paginated, selectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // -- Bulk operations --
  const bulkUpdate = useCallback(async (updates: Record<string, unknown>) => {
    const ids = Array.from(selectedIds);

    try {
      const res = await fetch('/api/procurement/bulk-update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageIds: ids, updates }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Bulk update failed:', err.message || res.statusText);
      }
    } catch (err) {
      console.error('Bulk update error:', err);
    }
    clearSelection();
    onBulkAction?.();
  }, [selectedIds, clearSelection, onBulkAction]);

  const bulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);

    try {
      const res = await fetch('/api/procurement/bulk-update', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageIds: ids }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Bulk delete failed:', err.message || res.statusText);
      }
    } catch (err) {
      console.error('Bulk delete error:', err);
    }
    clearSelection();
    onBulkAction?.();
  }, [selectedIds, clearSelection, onBulkAction]);

  // -- Derived --
  const allPageSelected =
    paginated.length > 0 && paginated.every((p) => selectedIds.has(p.id));

  const thClass =
    'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none transition-colors text-navy-600 hover:text-slate-300';

  return (
    <>
      <div
        className="rounded-xl border border-navy-800 overflow-hidden"
        style={{
          background:
            'linear-gradient(135deg, rgba(26, 39, 68, 0.7) 0%, rgba(10, 22, 40, 0.85) 100%)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Gold accent line */}
        <div
          className="h-[2px]"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, #d4af37 30%, #c9a84c 70%, transparent 100%)',
          }}
        />

        {/* Desktop header */}
        <div
          className={`hidden md:grid ${GRID_COLS} border-b border-navy-800/70`}
          style={{
            background:
              'linear-gradient(135deg, rgba(26, 39, 68, 0.95) 0%, rgba(20, 32, 56, 0.95) 100%)',
          }}
        >
          {/* Select-all checkbox */}
          <div className="flex items-center justify-center px-1 py-2.5">
            <input
              type="checkbox"
              checked={allPageSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-navy-800 accent-gold-500 cursor-pointer"
              aria-label="Select all tenders on this page"
            />
          </div>
          <div className={thClass} onClick={() => handleSort('title')}>
            <span className="flex items-center gap-1">
              Tender <SortIcon field="title" current={sortField} dir={sortDir} />
            </span>
          </div>
          <div className={thClass} onClick={() => handleSort('agency')}>
            <span className="flex items-center gap-1">
              Agency <SortIcon field="agency" current={sortField} dir={sortDir} />
            </span>
          </div>
          <div className={thClass} onClick={() => handleSort('current_stage')}>
            <span className="flex items-center gap-1">
              Stage{' '}
              <SortIcon field="current_stage" current={sortField} dir={sortDir} />
            </span>
          </div>
          <div
            className={thClass}
            onClick={() => handleSort('days_at_current_stage')}
          >
            <span className="flex items-center gap-1">
              Days{' '}
              <SortIcon
                field="days_at_current_stage"
                current={sortField}
                dir={sortDir}
              />
            </span>
          </div>
          <div
            className={thClass}
            onClick={() => handleSort('expected_delivery_date')}
          >
            <span className="flex items-center gap-1">
              Deadline{' '}
              <SortIcon
                field="expected_delivery_date"
                current={sortField}
                dir={sortDir}
              />
            </span>
          </div>
          <div
            className={thClass}
            onClick={() => handleSort('submitted_by_name')}
          >
            <span className="flex items-center gap-1">
              By{' '}
              <SortIcon
                field="submitted_by_name"
                current={sortField}
                dir={sortDir}
              />
            </span>
          </div>
          <div className={thClass} onClick={() => handleSort('updated_at')}>
            <span className="flex items-center gap-1">
              Updated{' '}
              <SortIcon field="updated_at" current={sortField} dir={sortDir} />
            </span>
          </div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-navy-800/30">
          {paginated.map((pkg, index) => {
            const methodLabel =
              METHOD_CONFIG[pkg.procurement_method]?.label ??
              pkg.procurement_method;
            const isSelected = selectedIds.has(pkg.id);

            return (
              <div
                key={pkg.id}
                className={`group cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? 'bg-gold-500/10 border-l-2 border-l-gold-500'
                    : `hover:bg-white/[0.03] border-l-2 border-l-transparent hover:border-l-gold-500 ${
                        index % 2 === 1 ? 'bg-white/[0.015]' : ''
                      }`
                }`}
                style={{
                  animation: 'fadeIn 0.3s ease both',
                  animationDelay: `${Math.min(index * 20, 400)}ms`,
                }}
              >
                {/* Desktop row */}
                <div
                  className={`hidden md:grid ${GRID_COLS} items-center`}
                  style={{ minHeight: 44 }}
                  onClick={() => selectionMode ? toggleSelect(pkg.id) : onSelect(pkg.id)}
                >
                  {/* Checkbox */}
                  <div className="flex items-center justify-center px-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        toggleSelect(pkg.id, e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey);
                      }}
                      className="w-4 h-4 rounded border-navy-800 accent-gold-500 cursor-pointer"
                      aria-label={`Select ${pkg.title}`}
                    />
                  </div>
                  <div className="px-3 py-2.5">
                    <span className="text-sm text-white font-medium line-clamp-1 group-hover:text-gold-400 transition-colors">
                      {pkg.title}
                    </span>
                    <span className="text-[11px] text-navy-600 mt-0.5 block">
                      {methodLabel}
                    </span>
                  </div>
                  <div className="px-3 py-2.5">
                    <AgencyBadge agency={pkg.agency} />
                  </div>
                  <div className="px-3 py-2.5">
                    <ProcurementStageBadge stage={pkg.current_stage} size="sm" />
                  </div>
                  <div className="px-3 py-2.5">
                    <DaysAtStageIndicator days={pkg.days_at_current_stage} />
                  </div>
                  <div className="px-3 py-2.5">
                    {pkg.expected_delivery_date ? (
                      <span className="text-xs text-navy-600 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {fmtDate(pkg.expected_delivery_date)}
                      </span>
                    ) : (
                      <span className="text-[#3d4a62]">&mdash;</span>
                    )}
                  </div>
                  <div className="px-3 py-2.5">
                    <span className="text-xs text-slate-400 truncate block">
                      {pkg.submitted_by_name || '\u2014'}
                    </span>
                  </div>
                  <div className="px-3 py-2.5">
                    <span className="text-[11px] text-navy-600">
                      {fmtRelativeTime(pkg.updated_at)}
                    </span>
                  </div>
                </div>

                {/* Mobile row */}
                <div
                  className="flex md:hidden items-center gap-3 px-3 py-2.5"
                  style={{ minHeight: 48 }}
                  onClick={() => {
                    if (selectionMode) {
                      toggleSelect(pkg.id);
                    } else {
                      onSelect(pkg.id);
                    }
                  }}
                >
                  {/* Mobile checkbox: visible in selection mode */}
                  {(selectionMode || isSelected) && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelect(pkg.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded border-navy-800 accent-gold-500 cursor-pointer shrink-0"
                      aria-label={`Select ${pkg.title}`}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate group-hover:text-gold-400 transition-colors">
                      {pkg.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <AgencyBadge agency={pkg.agency} />
                      <ProcurementStageBadge
                        stage={pkg.current_stage}
                        size="sm"
                      />
                      <DaysAtStageIndicator days={pkg.days_at_current_stage} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {paginated.length === 0 && (
            <div className="flex items-center justify-center h-32 text-navy-600 text-sm">
              No tenders match your filters
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between px-3 md:px-4 py-3 border-t border-navy-800/50 gap-2">
            <span className="text-navy-600 text-xs">
              {(effectivePage - 1) * PAGE_SIZE + 1}&ndash;
              {Math.min(effectivePage * PAGE_SIZE, sorted.length)} of{' '}
              {sorted.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(effectivePage - 1)}
                disabled={effectivePage <= 1}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-navy-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 ||
                    p === totalPages ||
                    Math.abs(p - effectivePage) <= 1,
                )
                .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1)
                    acc.push('ellipsis');
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === 'ellipsis' ? (
                    <span
                      key={`e${idx}`}
                      className="px-1.5 text-navy-600 text-xs"
                    >
                      &hellip;
                    </span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item as number)}
                      aria-current={item === effectivePage ? 'page' : undefined}
                      className={`min-w-[28px] px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        item === effectivePage
                          ? 'bg-gold-500/20 text-gold-500 border border-gold-500/30'
                          : 'text-slate-400 hover:text-white hover:bg-navy-800'
                      }`}
                    >
                      {item}
                    </button>
                  ),
                )}
              <button
                onClick={() => setPage(effectivePage + 1)}
                disabled={effectivePage >= totalPages}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-navy-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      <ProcurementBulkBar
        count={selectedIds.size}
        isMobile={isMobile}
        onClear={clearSelection}
        onBulkUpdate={bulkUpdate}
        onBulkDelete={bulkDelete}
      />
    </>
  );
}
