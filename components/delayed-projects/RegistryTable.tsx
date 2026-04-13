'use client';

import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DelayedProjectWithComputed } from '@/lib/delayed-projects/types';
import { fmtCurrency, fmtDate } from '@/components/oversight/types';
import { RiskTierBadge, AgencyBadge, DaysOverdueBadge, DeltaIndicator, CompletionBar } from './shared';
import { Spinner } from '@/components/ui/Spinner';

interface RegistryTableProps {
  projects: DelayedProjectWithComputed[];
  loading: boolean;
  sort: { field: string; dir: 'asc' | 'desc' };
  onSort: (field: string) => void;
  onSelectProject: (project: DelayedProjectWithComputed) => void;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  isMobile: boolean;
}

const COLUMNS = [
  { key: 'risk', label: 'Risk', sortable: false, width: 'w-16' },
  { key: 'name', label: 'Project', sortable: true, width: 'flex-1 min-w-[180px]' },
  { key: 'agency', label: 'Agency', sortable: true, width: 'w-20' },
  { key: 'region', label: 'Region', sortable: true, width: 'w-16' },
  { key: 'value', label: 'Value', sortable: true, width: 'w-24' },
  { key: 'completion', label: 'Completion', sortable: true, width: 'w-28' },
  { key: 'delta', label: '\u0394', sortable: false, width: 'w-16' },
  { key: 'overdue', label: 'Overdue', sortable: false, width: 'w-20' },
  { key: 'contractor', label: 'Contractor', sortable: false, width: 'w-32' },
  { key: 'end_date', label: 'End Date', sortable: true, width: 'w-24' },
];

export function RegistryTable({
  projects, loading, sort, onSort, onSelectProject,
  page, totalPages, total, onPageChange, isMobile,
}: RegistryTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="md" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-12 text-navy-600 text-sm">No projects match your filters.</div>
    );
  }

  // Mobile: card layout
  if (isMobile) {
    return (
      <div className="space-y-2">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelectProject(p)}
            className="w-full text-left card-premium p-4 space-y-2"
          >
            <div className="flex items-center gap-2">
              <RiskTierBadge tier={p.risk_tier} />
              <AgencyBadge agency={p.sub_agency} />
            </div>
            <p className="text-sm text-white font-medium line-clamp-2">{p.project_name}</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{fmtCurrency(p.contract_value / 100)}</span>
              <CompletionBar pct={p.completion_percent} />
              <DaysOverdueBadge days={p.days_overdue} />
            </div>
          </button>
        ))}
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={onPageChange} />
      </div>
    );
  }

  // Desktop: table
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-navy-800">
        <table className="table-premium w-full text-sm">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`text-left ${col.width} ${col.sortable ? 'cursor-pointer hover:text-white select-none' : ''}`}
                  onClick={col.sortable ? () => onSort(col.key) : undefined}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && sort.field === col.key && (
                      sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr
                key={p.id}
                onClick={() => onSelectProject(p)}
                className="cursor-pointer"
              >
                <td><RiskTierBadge tier={p.risk_tier} /></td>
                <td>
                  <span className="text-white font-medium line-clamp-1" title={p.project_name}>
                    {p.project_name}
                  </span>
                </td>
                <td><AgencyBadge agency={p.sub_agency} /></td>
                <td className="text-slate-400 tabular-nums">{p.region || '-'}</td>
                <td className="text-white tabular-nums">{fmtCurrency(p.contract_value / 100)}</td>
                <td><CompletionBar pct={p.completion_percent} /></td>
                <td><DeltaIndicator delta={p.delta_completion} stalledWeeks={p.stalled_weeks} /></td>
                <td><DaysOverdueBadge days={p.days_overdue} /></td>
                <td className="text-slate-400 truncate max-w-[120px]" title={p.contractors || ''}>{p.contractors || '-'}</td>
                <td className="text-slate-400 tabular-nums whitespace-nowrap">{fmtDate(p.project_end_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={onPageChange} />
    </div>
  );
}

function Pagination({ page, totalPages, total, onPageChange }: {
  page: number; totalPages: number; total: number; onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-navy-600">{total} projects &middot; Page {page}/{totalPages}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-lg text-navy-600 hover:text-white disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-lg text-navy-600 hover:text-white disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
