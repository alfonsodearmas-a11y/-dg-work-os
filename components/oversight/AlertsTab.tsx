'use client';

import React, { Fragment, useState, useMemo } from 'react';
import {
  AlertTriangle, ShieldAlert, Clock, FileWarning, TrendingUp,
  Building2, ChevronRight, ChevronDown,
} from 'lucide-react';
import type { OversightData } from './types';
import { formatCurrency } from './types';
import { StatusBadge, OversightKpiCard } from './shared';

function CollapsibleSection({ title, icon: Icon, count, accent, defaultOpen = false, children }: {
  title: string; icon: any; count: number; accent: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 hover:bg-[#2d3a52]/30 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${accent} flex items-center justify-center`}><Icon className="h-4 w-4" /></div>
          <span className="text-white font-medium">{title}</span>
          <span className="bg-[#2d3a52] text-[#94a3b8] text-xs px-2 py-0.5 rounded-full">{count}</span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-[#64748b]" /> : <ChevronRight className="h-4 w-4 text-[#64748b]" />}
      </button>
      {open && <div className="border-t border-[#2d3a52]">{children}</div>}
    </div>
  );
}

function ProjectRow({ project, tag }: { project: any; tag?: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-[#2d3a52]/20 transition-colors border-b border-[#2d3a52]/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{project.name || 'Unnamed'}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[#64748b]">
          <span>{project.agency}</span>
          {project.region && <span>{project.region}</span>}
          {project.contractValueDisplay && <span>{project.contractValueDisplay}</span>}
          {project.contractor && <span>{project.contractor}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {project.completion != null && (
          <div className="text-right">
            <p className="text-xs font-mono text-[#94a3b8]">{project.completion}%</p>
            <div className="w-16 h-1.5 bg-[#2d3a52] rounded-full mt-1">
              <div className="h-full rounded-full bg-[#d4af37]" style={{ width: `${Math.min(project.completion, 100)}%` }} />
            </div>
          </div>
        )}
        {tag && <StatusBadge status={tag} />}
        {project.daysOverdue != null && <span className="text-red-400 text-xs font-mono whitespace-nowrap">{project.daysOverdue}d late</span>}
        {project.daysRemaining != null && <span className="text-yellow-400 text-xs font-mono whitespace-nowrap">{project.daysRemaining}d left</span>}
      </div>
    </div>
  );
}

export function AlertsTabContent({
  oversightData, oversightLoading, oversightError,
  expandedAgency, onExpandedAgencyChange,
  projectsByAgency,
}: {
  oversightData: OversightData | null;
  oversightLoading: boolean;
  oversightError: string | null;
  expandedAgency: string | null;
  onExpandedAgencyChange: (agency: string | null) => void;
  projectsByAgency: Record<string, { project: any; tag: string }[]>;
}) {
  return (
    <>
      {oversightLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-[#1a2744] border border-[#2d3a52] rounded-xl p-4 animate-pulse"><div className="h-3 w-16 bg-[#2d3a52] rounded mb-2" /><div className="h-7 w-20 bg-[#2d3a52] rounded" /></div>)}
        </div>
      ) : oversightError ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-400 font-medium">{oversightError}</p>
          <p className="text-[#64748b] text-sm mt-1">Run <code className="bg-[#2d3a52] px-2 py-0.5 rounded text-xs">cd scraper && node scraper.js --highlights</code> to generate data.</p>
        </div>
      ) : oversightData ? (
        <>
          {/* Scraped KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <OversightKpiCard label="Contract Cost" value={oversightData.dashboard.kpis.totalContractCostDisplay || formatCurrency(oversightData.dashboard.kpis.totalContractCost ?? null)} />
            <OversightKpiCard label="Disbursement" value={oversightData.dashboard.kpis.totalDisbursementDisplay || formatCurrency(oversightData.dashboard.kpis.totalDisbursement ?? null)} />
            <OversightKpiCard label="Balance" value={oversightData.dashboard.kpis.totalBalanceDisplay || formatCurrency(oversightData.dashboard.kpis.totalBalance ?? null)} />
            <OversightKpiCard label="Projects" value={String(oversightData.dashboard.kpis.totalProjects ?? oversightData.metadata.totalProjects)} />
            <OversightKpiCard label="Utilization" value={oversightData.dashboard.kpis.utilizationPercent != null ? `${oversightData.dashboard.kpis.utilizationPercent}%` : '-'} />
            <OversightKpiCard label="Engineer Est." value={oversightData.dashboard.kpis.engineerEstimateDisplay || formatCurrency(oversightData.dashboard.kpis.engineerEstimate ?? null)} />
          </div>

          {/* Status Chart */}
          {oversightData.dashboard.statusChart && Object.keys(oversightData.dashboard.statusChart).length > 0 && (
            <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl p-4">
              <p className="text-[#64748b] text-xs uppercase tracking-wider mb-3">Project Status</p>
              <div className="flex flex-wrap gap-3">
                {Object.entries(oversightData.dashboard.statusChart).map(([label, value]) => {
                  const pct = typeof value === 'object' && value ? value.percent : typeof value === 'number' ? value : null;
                  const count = typeof value === 'object' && value ? value.count : null;
                  const colors: Record<string, string> = { Designed: 'bg-blue-500', Commenced: 'bg-emerald-500', Delayed: 'bg-orange-500', Completed: 'bg-green-500', Rollover: 'bg-purple-500', Cancelled: 'bg-red-500', 'N/A': 'bg-gray-500' };
                  return (<div key={label} className="flex items-center gap-2"><div className={`w-2.5 h-2.5 rounded-full ${colors[label] || 'bg-gray-500'}`} /><span className="text-white text-sm">{label}</span>{count != null && <span className="text-[#64748b] text-xs">({count})</span>}{pct != null && <span className="text-[#64748b] text-xs">{pct}%</span>}</div>);
                })}
              </div>
            </div>
          )}

          {/* Alert Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Overdue', count: oversightData.summary.overdue, color: 'text-red-400', bg: 'bg-red-500/10' },
              { label: 'At Risk', count: oversightData.summary.atRisk, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
              { label: 'Ending Soon', count: oversightData.summary.endingSoon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
              { label: 'Delayed', count: oversightData.summary.delayed, color: 'text-orange-400', bg: 'bg-orange-500/10' },
              { label: 'Bond Warnings', count: oversightData.summary.bondWarnings, color: 'text-purple-400', bg: 'bg-purple-500/10' },
            ].map(item => (
              <div key={item.label} className={`${item.bg} border border-[#2d3a52] rounded-xl p-3 text-center`}>
                <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
                <p className="text-[#64748b] text-xs mt-1">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Collapsible Alert Sections */}
          {oversightData.overdue.length > 0 && <CollapsibleSection title="Overdue Projects" icon={AlertTriangle} count={oversightData.overdue.length} accent="bg-red-500/20 text-red-400" defaultOpen>{oversightData.overdue.sort((a: any, b: any) => (b.daysOverdue || 0) - (a.daysOverdue || 0)).map((p: any, i: number) => <ProjectRow key={p.p3Id || i} project={p} tag="overdue" />)}</CollapsibleSection>}
          {oversightData.atRisk.length > 0 && <CollapsibleSection title="At-Risk Projects" icon={ShieldAlert} count={oversightData.atRisk.length} accent="bg-yellow-500/20 text-yellow-400">{oversightData.atRisk.sort((a: any, b: any) => (a.daysRemaining || 0) - (b.daysRemaining || 0)).map((p: any, i: number) => <ProjectRow key={p.p3Id || i} project={p} tag="at-risk" />)}</CollapsibleSection>}
          {oversightData.endingSoon.length > 0 && <CollapsibleSection title="Ending Soon" icon={Clock} count={oversightData.endingSoon.length} accent="bg-blue-500/20 text-blue-400">{oversightData.endingSoon.sort((a: any, b: any) => (a.daysRemaining || 0) - (b.daysRemaining || 0)).map((p: any, i: number) => <ProjectRow key={p.p3Id || i} project={p} tag="ending-soon" />)}</CollapsibleSection>}
          {oversightData.bondWarnings.length > 0 && <CollapsibleSection title="Bond Warnings" icon={FileWarning} count={oversightData.bondWarnings.length} accent="bg-purple-500/20 text-purple-400">{oversightData.bondWarnings.map((p: any, i: number) => <ProjectRow key={p.p3Id || i} project={p} tag="bond-warning" />)}</CollapsibleSection>}

          {/* Agency Breakdown */}
          <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b border-[#2d3a52]"><div className="w-8 h-8 rounded-lg bg-[#d4af37]/20 flex items-center justify-center"><Building2 className="h-4 w-4 text-[#d4af37]" /></div><span className="text-white font-medium">Agency Breakdown</span></div>
            {/* Mobile: card layout */}
            <div className="md:hidden divide-y divide-[#2d3a52]/50">
              {oversightData.agencyBreakdown.map(a => {
                const isExp = expandedAgency === a.agency;
                const agencyProjects = projectsByAgency[a.agency] || [];
                return (
                  <div key={a.agency}>
                    <button onClick={() => onExpandedAgencyChange(isExp ? null : a.agency)} className={`w-full p-3 flex items-center gap-3 transition-colors ${isExp ? 'bg-[#2d3a52]/30' : ''}`}>
                      <ChevronRight className={`h-3.5 w-3.5 text-[#64748b] shrink-0 transition-transform duration-200 ${isExp ? 'rotate-90' : ''}`} />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-white font-medium text-sm">{a.agency || '-'}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs">
                          <span className="text-[#94a3b8]">{a.projectCount} projects</span>
                          <span className="text-[#d4af37] font-mono">{a.totalValueDisplay || formatCurrency(a.totalValue)}</span>
                        </div>
                      </div>
                      {a.avgCompletion != null && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="w-12 h-1.5 bg-[#2d3a52] rounded-full"><div className="h-full rounded-full bg-[#d4af37]" style={{ width: `${a.avgCompletion}%` }} /></div>
                          <span className="text-[#94a3b8] font-mono text-xs">{a.avgCompletion}%</span>
                        </div>
                      )}
                    </button>
                    {isExp && <div className="bg-[#0a1628]/60 border-t border-[#2d3a52]/50">{agencyProjects.length > 0 ? <div className="max-h-[400px] overflow-y-auto">{agencyProjects.map((item, i) => <ProjectRow key={item.project.id || item.project.p3Id || i} project={item.project} tag={item.tag} />)}</div> : <p className="px-4 py-6 text-[#64748b] text-sm text-center">No flagged projects for this agency</p>}</div>}
                  </div>
                );
              })}
            </div>
            {/* Desktop: table layout */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm" aria-label="Agency breakdown">
                <thead><tr className="text-[#64748b] text-xs uppercase tracking-wider"><th scope="col" className="text-left px-4 py-3 w-6"></th><th scope="col" className="text-left px-4 py-3">Agency</th><th scope="col" className="text-right px-4 py-3">Projects</th><th scope="col" className="text-right px-4 py-3">Total Value</th><th scope="col" className="text-right px-4 py-3">Avg Completion</th></tr></thead>
                <tbody>
                  {oversightData.agencyBreakdown.map(a => {
                    const isExp = expandedAgency === a.agency;
                    const agencyProjects = projectsByAgency[a.agency] || [];
                    return (
                      <Fragment key={a.agency}>
                        <tr onClick={() => onExpandedAgencyChange(isExp ? null : a.agency)} className={`border-t border-[#2d3a52]/50 hover:bg-[#2d3a52]/20 cursor-pointer transition-colors ${isExp ? 'bg-[#2d3a52]/30' : ''}`}>
                          <td className="pl-4 py-3 w-6"><ChevronRight className={`h-3.5 w-3.5 text-[#64748b] transition-transform duration-200 ${isExp ? 'rotate-90' : ''}`} /></td>
                          <td className="px-4 py-3"><span className="text-white font-medium">{a.agency || '-'}</span>{a.agencyFull && a.agencyFull !== a.agency && <span className="text-[#64748b] text-xs ml-2">{a.agencyFull}</span>}</td>
                          <td className="px-4 py-3 text-[#94a3b8] text-right">{a.projectCount}</td>
                          <td className="px-4 py-3 text-[#d4af37] text-right font-mono">{a.totalValueDisplay || formatCurrency(a.totalValue)}</td>
                          <td className="px-4 py-3 text-right">{a.avgCompletion != null ? <div className="flex items-center justify-end gap-2"><div className="w-16 h-1.5 bg-[#2d3a52] rounded-full"><div className="h-full rounded-full bg-[#d4af37]" style={{ width: `${a.avgCompletion}%` }} /></div><span className="text-[#94a3b8] font-mono text-xs">{a.avgCompletion}%</span></div> : <span className="text-[#64748b]">-</span>}</td>
                        </tr>
                        {isExp && <tr><td colSpan={5} className="p-0"><div className="bg-[#0a1628]/60 border-t border-[#2d3a52]/50">{agencyProjects.length > 0 ? <div className="max-h-[400px] overflow-y-auto">{agencyProjects.map((item, i) => <ProjectRow key={item.project.id || item.project.p3Id || i} project={item.project} tag={item.tag} />)}</div> : <p className="px-4 py-6 text-[#64748b] text-sm text-center">No flagged projects for this agency</p>}</div></td></tr>}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top 10 */}
          <CollapsibleSection title="Top 10 by Contract Value" icon={TrendingUp} count={oversightData.top10.length} accent="bg-[#d4af37]/20 text-[#d4af37]">
            {oversightData.top10.map((p: any, i: number) => (
              <div key={p.id || i} className="flex items-center gap-3 px-4 py-3 border-b border-[#2d3a52]/50 last:border-0 hover:bg-[#2d3a52]/20">
                <span className="text-[#d4af37] font-mono text-sm w-6 text-right shrink-0">#{p.rank || i + 1}</span>
                <div className="flex-1 min-w-0"><p className="text-white text-sm font-medium truncate">{p.name}</p><p className="text-[#64748b] text-xs">{p.agency} &middot; {p.contractValueDisplay || formatCurrency(p.contractValue)}</p></div>
                {p.completion != null && <span className="text-[#94a3b8] font-mono text-xs shrink-0">{p.completion}%</span>}
              </div>
            ))}
          </CollapsibleSection>
        </>
      ) : null}
    </>
  );
}
