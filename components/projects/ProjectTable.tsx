'use client';

import React from 'react';
import { ShieldAlert, Square, CheckSquare } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { fmtCurrency as _fmtCurrency, fmtDate } from '@/lib/format';
import { PROJECT_STATUS_VARIANTS as STATUS_STYLES, HEALTH_DOT } from '@/lib/constants/agencies';
import type { Project, PortfolioSummary } from '@/types/projects';

// ── Formatting ─────────────────────────────────────────────────────────────

function fmtCurrency(value: number | string | null | undefined, allowZero = false): string {
  if (allowZero && (value === 0 || value === '0')) return '$0';
  return _fmtCurrency(value);
}

function fmtRegion(code: string | null): string {
  if (!code) return '-';
  const n = parseInt(code, 10);
  return isNaN(n) ? code : `Region ${n}`;
}

// ── Progress Bar ───────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const safePct = pct ?? 0;
  const color = safePct >= 100 ? 'bg-emerald-500' : safePct >= 80 ? 'bg-emerald-500' : safePct >= 40 ? 'bg-amber-500' : safePct > 0 ? 'bg-red-500' : 'bg-navy-800';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-navy-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(safePct, 100)}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{safePct}%</span>
    </div>
  );
}

// ── Health Dot ──────────────────────────────────────────────────────────────

function HealthDot({ health }: { health: string }) {
  const dot = HEALTH_DOT[health] || HEALTH_DOT.green;
  const labels: Record<string, string> = { green: 'On Track', amber: 'Minor Issues', red: 'Critical' };
  return (
    <span className="inline-flex items-center gap-1.5" title={labels[health] || health}>
      <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
      <span className="text-xs text-slate-400 hidden lg:inline">{labels[health] || health}</span>
    </span>
  );
}

// ── Project Table ──────────────────────────────────────────────────────────

export function ProjectTable({
  projects,
  loadingProjects,
  summary,
  isMobile,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onSelectProject,
}: {
  projects: Project[];
  loadingProjects: boolean;
  summary: PortfolioSummary | null;
  isMobile: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onSelectProject: (p: Project) => void;
}) {
  if (isMobile) {
    return (
      <div className="space-y-3">
        {loadingProjects ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="mobile-card animate-pulse">
              <div className="h-5 bg-navy-800 rounded w-20 mb-2" />
              <div className="h-4 bg-navy-800 rounded w-full mb-2" />
              <div className="h-3 bg-navy-800 rounded w-2/3 mb-2" />
              <div className="h-1.5 bg-navy-800 rounded w-full" />
            </div>
          ))
        ) : projects.length === 0 ? (
          <div className="card-premium p-8 text-center text-navy-600">
            {summary && summary.total_projects > 0 ? 'No projects match your filters.' : 'No projects yet. Upload an Excel file to get started.'}
          </div>
        ) : (
          projects.map(p => {
            const ss = STATUS_STYLES[p.status] || STATUS_STYLES['Unknown'];
            return (
              <div
                key={p.id}
                onClick={() => onSelectProject(p)}
                className={`mobile-card touch-active cursor-pointer ${p.escalated ? 'border-red-500/40 bg-red-500/5' : ''}`}
              >
                {p.escalated && (
                  <div className="flex items-center gap-1 mb-2 text-red-400 text-xs">
                    <ShieldAlert className="h-3 w-3" /> Escalated
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={ss.variant}>{ss.label}</Badge>
                    <HealthDot health={p.health} />
                  </div>
                  {p.sub_agency && (
                    <span className="text-gold-500 text-xs font-medium px-2 py-0.5 rounded bg-gold-500/10">{p.sub_agency}</span>
                  )}
                </div>
                <p className="text-white font-medium text-sm mb-2">{p.project_name || '-'}</p>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gold-500 font-semibold">{fmtCurrency(p.contract_value)}</span>
                  <span className={p.status === 'Delayed' ? 'text-red-400 font-semibold' : 'text-slate-400'}>{fmtDate(p.project_end_date)}</span>
                </div>
                {p.start_date && (
                  <div className="text-[10px] text-navy-600 mb-2">
                    Start: {fmtDate(p.start_date)}
                    {p.revised_start_date && p.revised_start_date !== p.start_date && (
                      <span className="text-gold-500 ml-2">Rev: {fmtDate(p.revised_start_date)}</span>
                    )}
                  </div>
                )}
                <ProgressBar pct={p.completion_pct} />
              </div>
            );
          })
        )}
      </div>
    );
  }

  // Desktop: Full Table
  return (
    <div className="card-premium overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="PSIP projects">
          <thead>
            <tr className="border-b border-navy-800 text-navy-600 text-xs uppercase">
              <th scope="col" className="px-3 py-3 text-center font-medium w-10">
                <button onClick={onToggleSelectAll} className="text-navy-600 hover:text-white" aria-label="Select all">
                  {selectedIds.size === projects.length && projects.length > 0 ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                </button>
              </th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Status</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Health</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Project Name</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Agency</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Region</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Contractor</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Value</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Start Date</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">End Date</th>
              <th scope="col" className="px-3 py-3 text-left font-medium">Completion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800/50">
            {loadingProjects ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 11 }).map((_, j) => (
                    <td key={j} className="px-3 py-3"><div className="h-5 bg-navy-800 rounded w-full" /></td>
                  ))}
                </tr>
              ))
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-navy-600">
                  {summary && summary.total_projects > 0 ? 'No projects match your filters.' : 'No projects yet. Upload an Excel file to get started.'}
                </td>
              </tr>
            ) : (
              projects.map(p => {
                const ss = STATUS_STYLES[p.status] || STATUS_STYLES['Unknown'];
                const isPastDue = p.status === 'Delayed';
                const isSelected = selectedIds.has(p.id);

                return (
                  <tr
                    key={p.id}
                    className={`hover:bg-navy-900/40 cursor-pointer transition-colors ${p.escalated ? 'bg-red-500/5 border-l-2 border-l-red-500' : ''} ${isSelected ? 'bg-gold-500/5' : ''}`}
                  >
                    <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <button onClick={() => onToggleSelect(p.id)} className="text-navy-600 hover:text-white">
                        {isSelected ? <CheckSquare className="h-4 w-4 text-gold-500" /> : <Square className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-3" onClick={() => onSelectProject(p)}>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={ss.variant}>{ss.label}</Badge>
                        {p.escalated && <ShieldAlert className="h-3.5 w-3.5 text-red-400" />}
                      </div>
                    </td>
                    <td className="px-3 py-3" onClick={() => onSelectProject(p)}>
                      <HealthDot health={p.health} />
                    </td>
                    <td className="px-4 py-3" onClick={() => onSelectProject(p)}>
                      <span className="text-white line-clamp-2 max-w-[350px]" title={p.project_name || ''}>
                        {p.project_name || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-3" onClick={() => onSelectProject(p)}>
                      <span className="text-gold-500 font-medium text-xs">{p.sub_agency || '-'}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-400" onClick={() => onSelectProject(p)}>{fmtRegion(p.region)}</td>
                    <td className="px-3 py-3" onClick={() => onSelectProject(p)}>
                      <span className="text-slate-400 line-clamp-1 max-w-[180px]" title={p.contractor || ''}>{p.contractor || '-'}</span>
                    </td>
                    <td className="px-3 py-3 text-right" onClick={() => onSelectProject(p)}>
                      <span className="text-gold-500 font-mono text-xs">{fmtCurrency(p.contract_value)}</span>
                    </td>
                    <td className="px-3 py-3" onClick={() => onSelectProject(p)}>
                      <span className="text-slate-400">{fmtDate(p.start_date)}</span>
                      {p.revised_start_date && p.revised_start_date !== p.start_date && (
                        <span className="block text-[10px] text-gold-500">Rev: {fmtDate(p.revised_start_date)}</span>
                      )}
                    </td>
                    <td className="px-3 py-3" onClick={() => onSelectProject(p)}>
                      <span className={isPastDue ? 'text-red-400 font-semibold' : 'text-slate-400'}>{fmtDate(p.project_end_date)}</span>
                    </td>
                    <td className="px-3 py-3" onClick={() => onSelectProject(p)}>
                      <ProgressBar pct={p.completion_pct} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
