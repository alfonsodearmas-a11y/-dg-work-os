'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Radio } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate, truncate } from '@/lib/format';
import type { OutreachCaseRow, OutreachSortField } from '@/lib/direct-outreach/types';
import { OUTREACH_STATUS_VARIANTS, idleColorClass, outreachAgencyColor } from './shared';

interface CasesTableProps {
  cases: OutreachCaseRow[];
  loading: boolean;
  sort: OutreachSortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: OutreachSortField) => void;
  onSelect: (caseId: number) => void;
  /** Only superadmins can upload — don't tell agency managers to. */
  canUpload?: boolean;
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

export function CasesTable({ cases, loading, sort, sortDir, onSort, onSelect, canUpload = false }: CasesTableProps) {
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
        <EmptyState
          icon={<Radio className="h-10 w-10" />}
          title="No cases match"
          description={
            canUpload
              ? 'Adjust the filters, or upload the OP Direct workbook to populate this view.'
              : 'Adjust the filters, or check back after the next OP Direct workbook upload.'
          }
        />
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
              <SortableTh field="latest_update_date" sort={sort} sortDir={sortDir} onSort={onSort}>Latest Update</SortableTh>
              <SortableTh field="days_idle" sort={sort} sortDir={sortDir} onSort={onSort}>Idle</SortableTh>
              <SortableTh field="committed_date" sort={sort} sortDir={sortDir} onSort={onSort}>Target Date</SortableTh>
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
                  <span
                    className="font-mono font-semibold text-xs tracking-wider"
                    style={{ color: outreachAgencyColor(c.agency) }}
                  >
                    {c.agency ?? '—'}
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
                  <span className={`font-semibold tabular-nums ${idleColorClass(c.days_idle)}`}>
                    {c.days_idle == null ? '—' : `${c.days_idle}d`}
                  </span>
                </td>
                <td>
                  {c.committed_date ? (
                    <Badge variant={c.committed_overdue ? 'danger' : 'success'}>
                      {fmtDate(c.committed_date)}
                      {c.committed_overdue && ' · OVERDUE'}
                    </Badge>
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
