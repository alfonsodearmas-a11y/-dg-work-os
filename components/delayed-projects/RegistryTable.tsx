'use client';

import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { DelayedProjectWithComputed } from '@/lib/delayed-projects/types';
import { fmtCurrency } from '@/components/oversight/types';
import { getShortName } from '@/lib/delayed-projects/short-names';
import { RiskTierBadge, AgencyBadge, DaysOverdueBadge, DeltaIndicator, CompletionBar } from './shared';
import { Spinner } from '@/components/ui/Spinner';

interface RegistryTableProps {
  projects: DelayedProjectWithComputed[];
  loading: boolean;
  sort: { field: string; dir: 'asc' | 'desc' };
  onSort: (field: string) => void;
  onSelectProject: (project: DelayedProjectWithComputed) => void;
  onLogIntervention?: (project: DelayedProjectWithComputed) => void;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  isMobile: boolean;
  isCleared?: boolean;
}

const ACTIVE_COLUMNS = [
  { key: 'risk', label: 'Risk', sortable: true, width: 'w-16' },
  { key: 'name', label: 'Project', sortable: true, width: 'flex-1 min-w-[200px]' },
  { key: 'agency', label: 'Agency', sortable: true, width: 'w-20' },
  { key: 'region', label: 'Rgn', sortable: true, width: 'w-14' },
  { key: 'value', label: 'Value', sortable: true, width: 'w-24' },
  { key: 'completion', label: 'Completion', sortable: true, width: 'w-28' },
  { key: 'delta', label: 'Δ', sortable: false, width: 'w-16' },
  { key: 'overdue', label: 'Overdue', sortable: true, width: 'w-20' },
  { key: 'interventions', label: 'Int.', sortable: true, width: 'w-14' },
  { key: 'action', label: '', sortable: false, width: 'w-16' },
];

const CLEARED_COLUMNS = [
  { key: 'name', label: 'Project', sortable: false, width: 'flex-1 min-w-[200px]' },
  { key: 'agency', label: 'Agency', sortable: false, width: 'w-20' },
  { key: 'region', label: 'Rgn', sortable: false, width: 'w-14' },
  { key: 'value', label: 'Value', sortable: false, width: 'w-24' },
  { key: 'completion', label: 'Completion', sortable: false, width: 'w-28' },
  { key: 'cleared_date', label: 'Cleared', sortable: false, width: 'w-24' },
  { key: 'cleared_by', label: 'Cleared by', sortable: false, width: 'w-36' },
];

export function RegistryTable({
  projects, loading, sort, onSort, onSelectProject, onLogIntervention,
  page, totalPages, total, onPageChange, isMobile, isCleared = false,
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
      <div className="text-center py-12 text-navy-600 text-sm">
        {isCleared ? 'No cleared projects match your filters.' : 'No projects match your filters.'}
      </div>
    );
  }

  // Active view: conditionally show delta column only when meaningful data exists
  const showDelta = !isCleared && projects.some((p) => p.delta_completion !== null);
  const COLUMNS = isCleared
    ? CLEARED_COLUMNS
    : (showDelta ? ACTIVE_COLUMNS : ACTIVE_COLUMNS.filter((c) => c.key !== 'delta'));

  // Mobile: card layout
  if (isMobile) {
    return (
      <div className="space-y-2">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelectProject(p)}
            className={`w-full text-left rounded-xl p-4 space-y-2 bg-[rgba(255,255,255,0.03)] backdrop-blur-sm border border-[rgba(255,255,255,0.08)] hover:border-gold-500/30 transition-all ${isCleared ? 'opacity-70' : ''}`}
          >
            <div className="flex items-center gap-2">
              {!isCleared && <RiskTierBadge tier={p.risk_tier} />}
              <AgencyBadge agency={p.sub_agency} />
              {isCleared && (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-medium border border-emerald-500/30">
                  Cleared
                </span>
              )}
            </div>
            <p className="text-sm text-white font-semibold" title={p.project_name}>{getShortName(p.project_name)}</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{fmtCurrency(p.contract_value / 100)}</span>
              <CompletionBar pct={p.completion_percent} />
              {isCleared ? (
                <span className="text-emerald-400/80 text-[11px]">
                  {p.resolved_at
                    ? new Date(p.resolved_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                    : '—'}
                </span>
              ) : (
                <>
                  <DaysOverdueBadge endDate={p.project_end_date} />
                  <span className={`text-[10px] tabular-nums font-medium ${
                    p.intervention_count === 0 ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {p.intervention_count === 0 ? '0 int.' : `${p.intervention_count} int.`}
                  </span>
                </>
              )}
            </div>
            {isCleared && p.resolved_by_file && (
              <p className="text-[10px] text-navy-600 truncate">
                {p.resolved_by_file}
                {p.resolved_by_uploaded_at && (
                  <> · {new Date(p.resolved_by_uploaded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</>
                )}
              </p>
            )}
          </button>
        ))}
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={onPageChange} isCleared={isCleared} />
      </div>
    );
  }

  // Desktop: table
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-xl border border-navy-800">
        <table className="table-premium w-full text-sm">
          <thead className="sticky top-0 z-10" style={{ background: 'linear-gradient(135deg, #1a2744 0%, #2d3a52 100%)' }}>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`text-left ${col.width} ${col.sortable ? 'cursor-pointer select-none' : ''} text-[11px] uppercase tracking-wider`}
                  onClick={col.sortable ? () => onSort(col.key) : undefined}
                >
                  <span className="flex items-center gap-1">
                    <span className={sort.field === col.key ? 'text-gold-500' : 'text-gold-500/70'}>
                      {col.label}
                    </span>
                    {col.sortable && sort.field === col.key && (
                      sort.dir === 'asc'
                        ? <ChevronUp className="h-3 w-3 text-gold-500" />
                        : <ChevronDown className="h-3 w-3 text-gold-500" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const rowCleared = isCleared || p.status === 'RESOLVED';
              return (
                <tr
                  key={p.id}
                  onClick={() => onSelectProject(p)}
                  className={`cursor-pointer ${rowCleared ? 'opacity-70' : ''}`}
                >
                  {isCleared ? (
                    <>
                      <td>
                        <div className="flex items-start gap-1.5 flex-col">
                          <span className="text-white font-semibold whitespace-normal">
                            {getShortName(p.project_name)}
                          </span>
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-medium border border-emerald-500/30 w-fit">
                            Cleared
                          </span>
                        </div>
                      </td>
                      <td><AgencyBadge agency={p.sub_agency} /></td>
                      <td className="text-slate-400 tabular-nums">{p.region || '-'}</td>
                      <td className="text-white tabular-nums">{fmtCurrency(p.contract_value / 100)}</td>
                      <td><CompletionBar pct={p.completion_percent} /></td>
                      <td className="text-emerald-400/80 tabular-nums text-xs">
                        {p.resolved_at
                          ? new Date(p.resolved_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                          : '—'}
                      </td>
                      <td className="text-slate-400 text-xs">
                        {p.resolved_by_file ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="truncate max-w-[130px]" title={p.resolved_by_file}>{p.resolved_by_file}</span>
                            {p.resolved_by_uploaded_at && (
                              <span className="text-[10px] text-navy-600">
                                {new Date(p.resolved_by_uploaded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                              </span>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                    </>
                  ) : (
                    <>
                      <td><RiskTierBadge tier={p.risk_tier} /></td>
                      <td>
                        <span className="text-white font-semibold whitespace-normal">
                          {getShortName(p.project_name)}
                        </span>
                      </td>
                      <td><AgencyBadge agency={p.sub_agency} /></td>
                      <td className="text-slate-400 tabular-nums">{p.region || '-'}</td>
                      <td className="text-white tabular-nums">{fmtCurrency(p.contract_value / 100)}</td>
                      <td><CompletionBar pct={p.completion_percent} /></td>
                      {showDelta && <td><DeltaIndicator delta={p.delta_completion} stalledWeeks={p.stalled_weeks} /></td>}
                      <td><DaysOverdueBadge endDate={p.project_end_date} /></td>
                      <td>
                        <span className={`text-xs tabular-nums font-semibold ${
                          p.intervention_count === 0 ? 'text-red-400' : 'text-emerald-400'
                        }`}>
                          {p.intervention_count}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={(e) => { e.stopPropagation(); onLogIntervention?.(p); }}
                          className="btn-gold px-2 py-1 text-[10px] flex items-center gap-1"
                          title="Log intervention"
                        >
                          <Plus className="h-3 w-3" /> Log
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={onPageChange} isCleared={isCleared} />
    </div>
  );
}

function Pagination({ page, totalPages, total, onPageChange, isCleared }: {
  page: number; totalPages: number; total: number; onPageChange: (p: number) => void; isCleared?: boolean;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-navy-600">
        {total} {isCleared ? 'cleared projects' : 'projects'} &middot; Page {page}/{totalPages}
      </span>
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
