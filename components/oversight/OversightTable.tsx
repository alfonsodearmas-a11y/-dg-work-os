'use client';

import React, { useEffect, useRef } from 'react';
import { X, CheckSquare, Square, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EscalationControls } from '@/components/projects/EscalationControls';
import { ProjectAISummary } from '@/components/projects/ProjectAISummary';
import { ProjectActivityLog } from '@/components/projects/ProjectActivityLog';
import { STATUS_STYLES, fmtCurrency, fmtDate, fmtRegion } from './types';
import type { Project } from './types';
import { HealthDot, ProgressBar } from './shared';

export function ProjectSlidePanel({ project, onClose, userRole, onRefreshList }: {
  project: Project; onClose: () => void; userRole: string; onRefreshList: () => void;
}) {
  const slidePanelRef = useRef<HTMLDivElement>(null);

  // Lock body scroll on mobile when panel is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (slidePanelRef.current) {
      const focusable = slidePanelRef.current.querySelector<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])');
      focusable?.focus();
    }
  }, []);

  const ss = STATUS_STYLES[project.status] || STATUS_STYLES['Unknown'];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm touch-none" onClick={onClose} aria-hidden="true" />
      <div ref={slidePanelRef} role="dialog" aria-modal="true" aria-labelledby="oversight-project-panel-title" className="fixed inset-0 md:inset-auto md:right-0 md:top-0 md:bottom-0 z-50 w-full md:max-w-xl bg-[#0f1d32] md:border-l border-[#2d3a52] shadow-2xl overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="sticky top-0 z-10 bg-[#0f1d32] border-b border-[#2d3a52] px-4 md:px-5 py-4 flex items-center justify-between">
          <h2 id="oversight-project-panel-title" className="text-white font-semibold text-lg truncate pr-4">Project Detail</h2>
          <button onClick={onClose} className="text-[#64748b] hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 md:p-5 space-y-5 md:space-y-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <EscalationControls
            projectId={project.id}
            projectName={project.project_name || ''}
            escalated={!!project.escalated}
            escalationReason={project.escalation_reason}
            userRole={userRole}
            onUpdate={onRefreshList}
            compact
          />
          <div>
            <h3 className="text-white font-semibold text-base mb-1">{project.project_name || '-'}</h3>
            <p className="text-[#64748b] text-xs font-mono">{project.project_id}</p>
            <div className="flex items-center gap-3 mt-3">
              <Badge variant={ss.variant}>{ss.label}</Badge>
              <HealthDot health={project.health} />
              {project.sub_agency && <span className="text-[#d4af37] text-xs font-medium px-2 py-0.5 rounded bg-[#d4af37]/10">{project.sub_agency}</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-[#64748b] text-xs">Contract Value</span><p className="text-[#d4af37] font-semibold">{fmtCurrency(project.contract_value)}</p></div>
            <div><span className="text-[#64748b] text-xs">Completion</span><div className="mt-0.5"><ProgressBar pct={project.completion_pct} /></div></div>
            <div><span className="text-[#64748b] text-xs">Contractor</span><p className="text-white">{project.contractor || '-'}</p></div>
            <div><span className="text-[#64748b] text-xs">Region</span><p className="text-white">{fmtRegion(project.region)}</p></div>
            <div><span className="text-[#64748b] text-xs">Start Date</span><p className="text-white">{fmtDate(project.start_date)}</p>{project.revised_start_date && project.revised_start_date !== project.start_date && <p className="text-[#d4af37] text-[10px] mt-0.5">Revised: {fmtDate(project.revised_start_date)}</p>}</div>
            <div><span className="text-[#64748b] text-xs">End Date</span><p className={project.status === 'Delayed' ? 'text-red-400 font-semibold' : 'text-white'}>{fmtDate(project.project_end_date)}</p></div>
            <div>
              <span className="text-[#64748b] text-xs">Agency</span>
              <p className="text-white">{project.sub_agency || project.executing_agency || '-'}</p>
              {project.executing_agency && project.sub_agency && project.executing_agency !== project.sub_agency && <p className="text-[#4a5568] text-[10px] mt-0.5">under {project.executing_agency}</p>}
            </div>
            {project.days_overdue > 0 && <div><span className="text-[#64748b] text-xs">Days Overdue</span><p className="text-red-400 font-semibold">{project.days_overdue} days</p></div>}
          </div>

          {/* Oversight Detail Fields */}
          {(project.balance_remaining != null || project.total_distributed != null || project.total_expended != null || project.project_extended) && (
            <div className="space-y-4">
              {/* Financial Summary */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {project.balance_remaining != null && (
                  <div><span className="text-[#64748b] text-xs">Balance Remaining</span><p className="text-white font-semibold">{fmtCurrency(project.balance_remaining)}</p></div>
                )}
                {project.total_distributed != null && (
                  <div><span className="text-[#64748b] text-xs">Total Distributed</span><p className="text-white font-semibold">{fmtCurrency(project.total_distributed)}</p></div>
                )}
                {project.total_expended != null && (
                  <div><span className="text-[#64748b] text-xs">Total Expended</span><p className="text-white font-semibold">{fmtCurrency(project.total_expended)}</p></div>
                )}
                {project.total_distributed != null && project.total_expended != null && project.total_distributed > 0 && (
                  <div>
                    <span className="text-[#64748b] text-xs">Utilization</span>
                    <p className={`font-semibold ${(project.total_expended / project.total_distributed) > 0.8 ? 'text-emerald-400' : (project.total_expended / project.total_distributed) > 0.5 ? 'text-amber-400' : 'text-red-400'}`}>
                      {Math.round((project.total_expended / project.total_distributed) * 100)}%
                    </p>
                  </div>
                )}
              </div>

              {/* Extension Info */}
              {project.project_extended && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm">
                  <p className="text-amber-400 font-semibold text-xs mb-1">Extension Granted</p>
                  {project.extension_date && <p className="text-[#94a3b8] text-xs">New deadline: {fmtDate(project.extension_date)}</p>}
                  {project.extension_reason && <p className="text-[#94a3b8] text-xs mt-1">{project.extension_reason}</p>}
                </div>
              )}

              {/* Remarks */}
              {project.remarks && (
                <div>
                  <span className="text-[#64748b] text-xs">Remarks</span>
                  <p className="text-[#94a3b8] text-xs mt-1 leading-relaxed whitespace-pre-wrap md:line-clamp-4">{project.remarks}</p>
                </div>
              )}
            </div>
          )}

          {/* AI Summary */}
          <ProjectAISummary projectId={project.id} />
          {/* Activity Log */}
          <ProjectActivityLog projectId={project.id} />
        </div>
      </div>
    </>
  );
}

export function OversightProjectTable({ projects, loadingProjects, isMobile, selectedIds, onToggleSelect, onToggleSelectAll, onSelectProject, page, totalPages, totalCount, limit, onPageChange }: {
  projects: Project[];
  loadingProjects: boolean;
  isMobile: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onSelectProject: (p: Project) => void;
  page: number;
  totalPages: number;
  totalCount: number;
  limit: number;
  onPageChange: (p: number) => void;
}) {
  return (
    <>
      {/* ── Mobile card layout ── */}
      {isMobile ? (
        <div className="card-premium overflow-hidden">
          {/* Select all header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2d3a52]">
            <button onClick={onToggleSelectAll} className="flex items-center gap-2 text-[#64748b] hover:text-white text-xs">
              {selectedIds.size === projects.length && projects.length > 0 ? <CheckSquare className="h-4 w-4 text-[#d4af37]" aria-hidden="true" /> : <Square className="h-4 w-4" aria-hidden="true" />}
              Select all
            </button>
          </div>
          <div className="divide-y divide-[#2d3a52]/50">
            {loadingProjects ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-3 animate-pulse space-y-2">
                <div className="h-4 bg-[#2d3a52] rounded w-3/4" />
                <div className="h-3 bg-[#2d3a52] rounded w-1/2" />
                <div className="h-3 bg-[#2d3a52] rounded w-1/3" />
              </div>
            ))
            : projects.length === 0 ? (
              <div className="px-4 py-12 text-center text-[#64748b]">No projects match your filters.</div>
            )
            : projects.map(p => {
                const ss = STATUS_STYLES[p.status] || STATUS_STYLES['Unknown'];
                const isSelected = selectedIds.has(p.id);
                const displayName = p.short_name || p.project_name || '-';
                return (
                  <div key={p.id} onClick={() => onSelectProject(p)} className={`p-3 cursor-pointer transition-colors active:bg-[#1a2744]/60 ${p.escalated ? 'bg-red-500/5 border-l-2 border-l-red-500' : ''} ${isSelected ? 'bg-[#d4af37]/5' : ''}`}>
                    <div className="flex items-start gap-2.5">
                      <button onClick={e => { e.stopPropagation(); onToggleSelect(p.id); }} className="text-[#64748b] hover:text-white mt-0.5 shrink-0" aria-label={isSelected ? 'Deselect project' : 'Select project'}>
                        {isSelected ? <CheckSquare className="h-4 w-4 text-[#d4af37]" /> : <Square className="h-4 w-4" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate" title={p.project_name || ''}>{displayName}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-1.5">
                          <Badge variant={ss.variant}>{ss.label}</Badge>
                          <HealthDot health={p.health} />
                          {p.escalated && <ShieldAlert className="h-3.5 w-3.5 text-red-400" />}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-[#64748b]">
                          <span className="text-[#d4af37] font-medium">{p.sub_agency || '-'}</span>
                          <span>{fmtRegion(p.region)}</span>
                          <span className="text-[#d4af37] font-mono">{fmtCurrency(p.contract_value)}</span>
                        </div>
                        {/* Funding preview */}
                        {(p.balance_remaining != null || p.total_distributed != null || p.total_expended != null) && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
                            {p.total_distributed != null && <span className="text-[#94a3b8]">Distributed: <span className="text-white font-medium">{fmtCurrency(p.total_distributed)}</span></span>}
                            {p.total_expended != null && <span className="text-[#94a3b8]">Expended: <span className="text-white font-medium">{fmtCurrency(p.total_expended)}</span></span>}
                            {p.balance_remaining != null && <span className="text-[#94a3b8]">Balance: <span className="text-white font-medium">{fmtCurrency(p.balance_remaining)}</span></span>}
                          </div>
                        )}
                        {/* Remarks preview */}
                        {p.remarks && (
                          <p className="text-[#64748b] text-xs mt-1 line-clamp-2 italic">{p.remarks}</p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span className={`text-xs ${p.status === 'Delayed' ? 'text-red-400 font-semibold' : 'text-[#94a3b8]'}`}>{fmtDate(p.project_end_date)}</span>
                          <ProgressBar pct={p.completion_pct} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
      /* ── Desktop table layout ── */
      <div className="card-premium overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Oversight projects">
            <thead>
              <tr className="border-b border-[#2d3a52] text-[#64748b] text-xs uppercase">
                <th scope="col" className="px-3 py-3 text-center font-medium w-10"><button onClick={onToggleSelectAll} className="text-[#64748b] hover:text-white" aria-label="Select all">{selectedIds.size === projects.length && projects.length > 0 ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}</button></th>
                <th scope="col" className="px-3 py-3 text-left font-medium">Status</th>
                <th scope="col" className="px-3 py-3 text-left font-medium">Health</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Project Name</th>
                <th scope="col" className="px-3 py-3 text-left font-medium">Agency</th>
                <th scope="col" className="px-3 py-3 text-left font-medium">Region</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Value</th>
                <th scope="col" className="px-3 py-3 text-left font-medium">End Date</th>
                <th scope="col" className="px-3 py-3 text-left font-medium">Completion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2d3a52]/50">
              {loadingProjects ? Array.from({ length: 8 }).map((_, i) => <tr key={i} className="animate-pulse">{Array.from({ length: 9 }).map((_, j) => <td key={j} className="px-3 py-3"><div className="h-5 bg-[#2d3a52] rounded w-full" /></td>)}</tr>)
              : projects.length === 0 ? <tr><td colSpan={9} className="px-4 py-12 text-center text-[#64748b]">No projects match your filters.</td></tr>
              : projects.map(p => {
                  const ss = STATUS_STYLES[p.status] || STATUS_STYLES['Unknown'];
                  const isSelected = selectedIds.has(p.id);
                  const displayName = p.short_name || p.project_name || '-';
                  return (
                    <tr key={p.id} onClick={() => onSelectProject(p)} className={`hover:bg-[#1a2744]/40 cursor-pointer transition-colors ${p.escalated ? 'bg-red-500/5 border-l-2 border-l-red-500' : ''} ${isSelected ? 'bg-[#d4af37]/5' : ''}`}>
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}><button onClick={() => onToggleSelect(p.id)} className="text-[#64748b] hover:text-white" aria-label={isSelected ? 'Deselect project' : 'Select project'}>{isSelected ? <CheckSquare className="h-4 w-4 text-[#d4af37]" /> : <Square className="h-4 w-4" />}</button></td>
                      <td className="px-3 py-3"><div className="flex items-center gap-1.5 flex-wrap"><Badge variant={ss.variant}>{ss.label}</Badge>{p.escalated && <ShieldAlert className="h-3.5 w-3.5 text-red-400" />}</div></td>
                      <td className="px-3 py-3"><HealthDot health={p.health} /></td>
                      <td className="px-4 py-3"><span className="text-white truncate block max-w-[300px]" title={p.project_name || ''}>{displayName}</span></td>
                      <td className="px-3 py-3"><span className="text-[#d4af37] font-medium text-xs">{p.sub_agency || '-'}</span></td>
                      <td className="px-3 py-3 text-[#94a3b8]">{fmtRegion(p.region)}</td>
                      <td className="px-3 py-3 text-right"><span className="text-[#d4af37] font-mono text-xs">{fmtCurrency(p.contract_value)}</span></td>
                      <td className="px-3 py-3"><span className={p.status === 'Delayed' ? 'text-red-400 font-semibold' : 'text-[#94a3b8]'}>{fmtDate(p.project_end_date)}</span></td>
                      <td className="px-3 py-3"><ProgressBar pct={p.completion_pct} /></td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
      )}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between px-2 md:px-4 py-3 gap-2">
          <span className="text-[#64748b] text-xs md:text-sm">{(page - 1) * limit + 1}-{Math.min(page * limit, totalCount)} of {totalCount}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1} className="btn-navy px-3 py-1.5 text-sm disabled:opacity-30">Prev</button>
            <span className="text-[#94a3b8] text-xs md:text-sm">{page}/{totalPages}</span>
            <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="btn-navy px-3 py-1.5 text-sm disabled:opacity-30">Next</button>
          </div>
        </div>
      )}
    </>
  );
}
