'use client';

import { ArrowDown, ArrowRightLeft, ArrowUp, ArrowUpDown, ChevronRight, Radio } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate, truncate } from '@/lib/format';
import type { OutreachCaseRow, OutreachSortField } from '@/lib/direct-outreach/types';
import { OUTREACH_WORKING_STATUS_LABELS } from '@/lib/direct-outreach/types';
import {
  OUTREACH_STATUS_VARIANTS,
  WORKING_STATUS_VARIANTS,
  idleColorClass,
  initials,
  officerActionColorClass,
  outreachAgencyColor,
} from './shared';

interface CasesTableProps {
  cases: OutreachCaseRow[];
  loading: boolean;
  sort: OutreachSortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: OutreachSortField) => void;
  onSelect: (caseId: number) => void;
  /** Only superadmins can upload — don't tell agency managers to. */
  canUpload?: boolean;
  /** True when any filter/chip/search narrows the list — switches the empty
   *  state from "no cases at all" to "no matches". */
  hasActiveFilters?: boolean;
  /** Resets every filter to the default params (existing clear-all handler). */
  onClearFilters?: () => void;
}

function SortableTh({
  field,
  sort,
  sortDir,
  onSort,
  children,
}: {
  field: OutreachSortField;
  sort: OutreachSortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: OutreachSortField) => void;
  children: React.ReactNode;
}) {
  const active = sort === field;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="flex items-center gap-1.5 hover:text-gold-300 transition-colors"
        aria-label={`Sort by ${field.replace(/_/g, ' ')}`}
      >
        {children}
        <Icon size={12} className={active ? '' : 'opacity-50'} aria-hidden="true" />
      </button>
    </th>
  );
}

export function CasesTable({
  cases, loading, sort, sortDir, onSort, onSelect,
  canUpload = false, hasActiveFilters = false, onClearFilters,
}: CasesTableProps) {
  if (loading) {
    return (
      <div className="card-premium flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="card-premium">
        {hasActiveFilters ? (
          <EmptyState
            icon={<Radio className="h-10 w-10" />}
            title="No cases match the current filters"
            description="Filters are narrowing the list — clear them to see the full backlog."
            action={
              onClearFilters ? (
                <button type="button" onClick={onClearFilters} className="btn-navy text-sm">
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            icon={<Radio className="h-10 w-10" />}
            title="No cases yet"
            description={
              canUpload
                ? 'Upload the OP Direct workbook to populate this view.'
                : 'Check back after the next OP Direct workbook upload.'
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="card-premium overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table-premium">
          <thead>
            <tr>
              <SortableTh field="case_id" sort={sort} sortDir={sortDir} onSort={onSort}>Case</SortableTh>
              <SortableTh field="agency" sort={sort} sortDir={sortDir} onSort={onSort}>Agency</SortableTh>
              <SortableTh field="status" sort={sort} sortDir={sortDir} onSort={onSort}>Status</SortableTh>
              <SortableTh field="theme" sort={sort} sortDir={sortDir} onSort={onSort}>Theme / Issue</SortableTh>
              <SortableTh field="assignee" sort={sort} sortDir={sortDir} onSort={onSort}>Officer</SortableTh>
              <SortableTh field="latest_update_date" sort={sort} sortDir={sortDir} onSort={onSort}>Latest Update</SortableTh>
              <SortableTh field="officer_update" sort={sort} sortDir={sortDir} onSort={onSort}>Officer Update</SortableTh>
              <SortableTh field="days_idle" sort={sort} sortDir={sortDir} onSort={onSort}>OP Idle</SortableTh>
              <SortableTh field="target_date" sort={sort} sortDir={sortDir} onSort={onSort}>Target Date</SortableTh>
              <th aria-label="Open detail" />
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr
                key={c.case_id}
                onClick={() => onSelect(c.case_id)}
                className="cursor-pointer"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(c.case_id);
                  }
                }}
              >
                <td>
                  <p className="font-mono text-sm text-gold-500">#{c.case_id}</p>
                  <p className="text-sm text-white truncate max-w-[160px]">{c.client_name || 'Unnamed client'}</p>
                  {c.outreach_location && (
                    <p className="text-xs text-navy-600 truncate max-w-[160px]">{c.outreach_location}</p>
                  )}
                </td>
                <td>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="font-mono font-semibold text-xs tracking-wider"
                      style={{ color: outreachAgencyColor(c.effective_agency) }}
                    >
                      {c.effective_agency ?? '—'}
                    </span>
                    {c.transferred && (
                      <span title={`Transferred from ${c.agency ?? 'unknown'}`} className="inline-flex">
                        <ArrowRightLeft
                          className="h-3 w-3 text-amber-400"
                          aria-label={`Transferred from ${c.agency ?? 'unknown'}`}
                        />
                      </span>
                    )}
                  </span>
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={OUTREACH_STATUS_VARIANTS[c.status ?? ''] ?? 'default'}>
                      {c.status ?? 'Unknown'}
                    </Badge>
                    {c.priority_flag === 'Elevated' && <Badge variant="danger">HIGH</Badge>}
                  </div>
                </td>
                <td>
                  <p className="text-sm text-slate-200">{c.theme ?? 'Other'}</p>
                  {c.description && (
                    <p className="text-xs text-navy-600 max-w-[240px] truncate">{c.description}</p>
                  )}
                </td>
                <td>
                  {c.assignee_user_id ? (
                    <div>
                      <span className="flex items-center gap-2" title={c.assignee_name ?? undefined}>
                        <span className="w-6 h-6 rounded-full bg-navy-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                          {initials(c.assignee_name)}
                        </span>
                        <span className="text-xs text-slate-400 truncate max-w-[110px]">
                          {c.assignee_name ?? 'Unknown'}
                        </span>
                      </span>
                      {c.working_status !== 'not_started' && (
                        <span className="inline-block mt-1">
                          <Badge variant={WORKING_STATUS_VARIANTS[c.working_status]}>
                            {OUTREACH_WORKING_STATUS_LABELS[c.working_status]}
                          </Badge>
                        </span>
                      )}
                    </div>
                  ) : (
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        Unassigned
                      </span>
                      {/* A manager can set progress before assigning — still show it. */}
                      {c.working_status !== 'not_started' && (
                        <span className="block mt-1">
                          <Badge variant={WORKING_STATUS_VARIANTS[c.working_status]}>
                            {OUTREACH_WORKING_STATUS_LABELS[c.working_status]}
                          </Badge>
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td>
                  {c.latest_update ? (
                    <>
                      <p className="text-xs text-slate-400 max-w-[260px]">{truncate(c.latest_update, 90)}</p>
                      <p className="text-[11px] text-navy-600 mt-0.5">
                        {c.latest_update_by || 'Unknown'} · {fmtDate(c.latest_update_date)}
                      </p>
                    </>
                  ) : (
                    <span className="text-xs text-navy-600 italic">No substantive update</span>
                  )}
                </td>
                <td>
                  {/* Days since officer action; NULL = unassigned & untouched ("most neglected"). */}
                  <span
                    className={`font-semibold tabular-nums ${officerActionColorClass(c.days_since_officer_action)}`}
                    title={
                      c.days_since_officer_action == null
                        ? 'No officer has ever been assigned or posted an update'
                        : `${c.days_since_officer_action} days since the last officer action`
                    }
                  >
                    {c.days_since_officer_action == null ? 'Never' : `${c.days_since_officer_action}d`}
                  </span>
                </td>
                <td>
                  <span className={`font-semibold tabular-nums ${idleColorClass(c.days_idle)}`}>
                    {c.days_idle == null ? '—' : `${c.days_idle}d`}
                  </span>
                </td>
                <td>
                  {c.effective_target_date ? (
                    <span
                      title={
                        c.officer_target_date
                          ? 'Officer-committed target date'
                          : 'Auto-detected from imported comments — verify'
                      }
                    >
                      <Badge variant={c.effective_target_overdue ? 'danger' : 'success'}>
                        {c.officer_target_date ? '' : '≈ '}
                        {fmtDate(c.effective_target_date)}
                        {c.effective_target_overdue && ' · OVERDUE'}
                      </Badge>
                    </span>
                  ) : (
                    <span className="text-xs text-navy-600">—</span>
                  )}
                </td>
                <td>
                  <ChevronRight className="h-4 w-4 text-navy-600" aria-hidden="true" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
