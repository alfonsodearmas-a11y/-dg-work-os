'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Eye,
  RefreshCw,
  AlertTriangle,
  Clock,
  ShieldAlert,
  FileWarning,
  Building2,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface OversightData {
  metadata: {
    generatedAt: string;
    totalProjects: number;
    analysisDate: string;
  };
  dashboard: {
    kpis: {
      totalContractCost: number | null;
      totalContractCostDisplay: string | null;
      totalDisbursement: number | null;
      totalDisbursementDisplay: string | null;
      totalBalance: number | null;
      totalBalanceDisplay: string | null;
      totalProjects: number | null;
      utilizationPercent: number | null;
      engineerEstimate: number | null;
      engineerEstimateDisplay: string | null;
    };
    statusChart: Record<string, { percent: number; count: number } | number | null>;
    scrapedAt: string;
  };
  summary: {
    delayed: number;
    overdue: number;
    endingSoon: number;
    atRisk: number;
    bondWarnings: number;
  };
  delayed: any[];
  overdue: any[];
  endingSoon: any[];
  atRisk: any[];
  bondWarnings: any[];
  agencyBreakdown: {
    agency: string;
    projectCount: number;
    totalContractValue: number;
    avgCompletion: number | null;
  }[];
  top10: any[];
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return '-';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    overdue: 'bg-red-500/20 text-red-400 border-red-500/30',
    delayed: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'at-risk': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'ending-soon': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'bond-warning': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] || 'bg-[#2d3a52] text-[#94a3b8]'}`}>
      {status.replace('-', ' ')}
    </span>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl p-4">
      <p className="text-[#64748b] text-xs uppercase tracking-wider">{label}</p>
      <p className="text-white text-xl md:text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-[#64748b] text-xs mt-1">{sub}</p>}
    </div>
  );
}

function CollapsibleSection({
  title,
  icon: Icon,
  count,
  accent,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: any;
  count: number;
  accent: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-[#2d3a52]/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${accent} flex items-center justify-center`}>
            <Icon className="h-4 w-4" />
          </div>
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
        <p className="text-white text-sm font-medium truncate">{project.projectName || 'Unnamed'}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[#64748b]">
          <span>{project.subAgency || project.executingAgency}</span>
          {project.region && <span>Region {project.region}</span>}
          {project.contractValueRaw && <span>{project.contractValueRaw}</span>}
          {project.contractors && <span>{project.contractors}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {project.completionPercent != null && (
          <div className="text-right">
            <p className="text-xs font-mono text-[#94a3b8]">{project.completionPercent}%</p>
            <div className="w-16 h-1.5 bg-[#2d3a52] rounded-full mt-1">
              <div
                className="h-full rounded-full bg-[#d4af37]"
                style={{ width: `${Math.min(project.completionPercent, 100)}%` }}
              />
            </div>
          </div>
        )}
        {tag && <StatusBadge status={tag} />}
        {project.daysOverdue != null && (
          <span className="text-red-400 text-xs font-mono whitespace-nowrap">{project.daysOverdue}d late</span>
        )}
        {project.daysRemaining != null && (
          <span className="text-yellow-400 text-xs font-mono whitespace-nowrap">{project.daysRemaining}d left</span>
        )}
      </div>
    </div>
  );
}

export default function OversightPage() {
  const [data, setData] = useState<OversightData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/oversight');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setData(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
            <Eye className="h-5 w-5 text-[#d4af37]" />
          </div>
          <h1 className="text-2xl font-bold text-white">Oversight Dashboard</h1>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-[#1a2744] border border-[#2d3a52] rounded-xl p-4 animate-pulse">
              <div className="h-3 w-16 bg-[#2d3a52] rounded mb-2" />
              <div className="h-7 w-20 bg-[#2d3a52] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
            <Eye className="h-5 w-5 text-[#d4af37]" />
          </div>
          <h1 className="text-2xl font-bold text-white">Oversight Dashboard</h1>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-400 font-medium">{error}</p>
          <p className="text-[#64748b] text-sm mt-1">
            Run <code className="bg-[#2d3a52] px-2 py-0.5 rounded text-xs">cd scraper && node scraper.js --highlights</code> to generate data.
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const kpis = data.dashboard?.kpis;
  const chart = data.dashboard?.statusChart;
  const scrapedAt = new Date(data.metadata.generatedAt);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center shrink-0">
            <Eye className="h-4 w-4 md:h-5 md:w-5 text-[#d4af37]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-white">Oversight Dashboard</h1>
            <p className="text-[#64748b] text-xs md:text-sm truncate">
              Scraped: {scrapedAt.toLocaleDateString()} at {scrapedAt.toLocaleTimeString()}
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] hover:text-white transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline text-sm">Refresh</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Contract Cost" value={kpis?.totalContractCostDisplay || formatCurrency(kpis?.totalContractCost ?? null)} />
        <KpiCard label="Disbursement" value={kpis?.totalDisbursementDisplay || formatCurrency(kpis?.totalDisbursement ?? null)} />
        <KpiCard label="Balance" value={kpis?.totalBalanceDisplay || formatCurrency(kpis?.totalBalance ?? null)} />
        <KpiCard label="Projects" value={String(kpis?.totalProjects ?? data.metadata.totalProjects)} />
        <KpiCard label="Utilization" value={kpis?.utilizationPercent != null ? `${kpis.utilizationPercent}%` : '-'} />
        <KpiCard label="Engineer Est." value={kpis?.engineerEstimateDisplay || formatCurrency(kpis?.engineerEstimate ?? null)} />
      </div>

      {/* Status Chart Row */}
      {chart && Object.keys(chart).length > 0 && (
        <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl p-4">
          <p className="text-[#64748b] text-xs uppercase tracking-wider mb-3">Project Status</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(chart).map(([label, value]) => {
              const pct = typeof value === 'object' && value ? value.percent : typeof value === 'number' ? value : null;
              const count = typeof value === 'object' && value ? value.count : null;
              const colors: Record<string, string> = {
                Designed: 'bg-blue-500',
                Commenced: 'bg-emerald-500',
                Delayed: 'bg-orange-500',
                Completed: 'bg-green-500',
                Rollover: 'bg-purple-500',
                Cancelled: 'bg-red-500',
                'N/A': 'bg-gray-500',
              };
              return (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${colors[label] || 'bg-gray-500'}`} />
                  <span className="text-white text-sm">{label}</span>
                  {count != null && <span className="text-[#64748b] text-xs">({count})</span>}
                  {pct != null && <span className="text-[#64748b] text-xs">{pct}%</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alert Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Overdue', count: data.summary.overdue, color: 'text-red-400', bg: 'bg-red-500/10' },
          { label: 'At Risk', count: data.summary.atRisk, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
          { label: 'Ending Soon', count: data.summary.endingSoon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Delayed', count: data.summary.delayed, color: 'text-orange-400', bg: 'bg-orange-500/10' },
          { label: 'Bond Warnings', count: data.summary.bondWarnings, color: 'text-purple-400', bg: 'bg-purple-500/10' },
        ].map((item) => (
          <div key={item.label} className={`${item.bg} border border-[#2d3a52] rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
            <p className="text-[#64748b] text-xs mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Overdue Projects */}
      {data.overdue.length > 0 && (
        <CollapsibleSection
          title="Overdue Projects"
          icon={AlertTriangle}
          count={data.overdue.length}
          accent="bg-red-500/20 text-red-400"
          defaultOpen
        >
          {data.overdue
            .sort((a: any, b: any) => (b.daysOverdue || 0) - (a.daysOverdue || 0))
            .map((p: any, i: number) => (
              <ProjectRow key={p.p3Id || i} project={p} tag="overdue" />
            ))}
        </CollapsibleSection>
      )}

      {/* At-Risk Projects */}
      {data.atRisk.length > 0 && (
        <CollapsibleSection
          title="At-Risk Projects"
          icon={ShieldAlert}
          count={data.atRisk.length}
          accent="bg-yellow-500/20 text-yellow-400"
        >
          {data.atRisk
            .sort((a: any, b: any) => (a.daysRemaining || 0) - (b.daysRemaining || 0))
            .map((p: any, i: number) => (
              <ProjectRow key={p.p3Id || i} project={p} tag="at-risk" />
            ))}
        </CollapsibleSection>
      )}

      {/* Ending Soon */}
      {data.endingSoon.length > 0 && (
        <CollapsibleSection
          title="Ending Soon"
          icon={Clock}
          count={data.endingSoon.length}
          accent="bg-blue-500/20 text-blue-400"
        >
          {data.endingSoon
            .sort((a: any, b: any) => (a.daysRemaining || 0) - (b.daysRemaining || 0))
            .map((p: any, i: number) => (
              <ProjectRow key={p.p3Id || i} project={p} tag="ending-soon" />
            ))}
        </CollapsibleSection>
      )}

      {/* Bond Warnings */}
      {data.bondWarnings.length > 0 && (
        <CollapsibleSection
          title="Bond Warnings"
          icon={FileWarning}
          count={data.bondWarnings.length}
          accent="bg-purple-500/20 text-purple-400"
        >
          {data.bondWarnings.map((p: any, i: number) => (
            <ProjectRow key={p.p3Id || i} project={p} tag="bond-warning" />
          ))}
        </CollapsibleSection>
      )}

      {/* Agency Breakdown */}
      <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-[#2d3a52]">
          <div className="w-8 h-8 rounded-lg bg-[#d4af37]/20 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-[#d4af37]" />
          </div>
          <span className="text-white font-medium">Agency Breakdown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#64748b] text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Agency</th>
                <th className="text-right px-4 py-3">Projects</th>
                <th className="text-right px-4 py-3">Total Value</th>
                <th className="text-right px-4 py-3">Avg Completion</th>
              </tr>
            </thead>
            <tbody>
              {data.agencyBreakdown.map((a) => (
                <tr key={a.agency} className="border-t border-[#2d3a52]/50 hover:bg-[#2d3a52]/20">
                  <td className="px-4 py-3 text-white font-medium">{a.agency || '-'}</td>
                  <td className="px-4 py-3 text-[#94a3b8] text-right">{a.projectCount}</td>
                  <td className="px-4 py-3 text-[#94a3b8] text-right font-mono">{formatCurrency(a.totalContractValue)}</td>
                  <td className="px-4 py-3 text-right">
                    {a.avgCompletion != null ? (
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-[#2d3a52] rounded-full">
                          <div className="h-full rounded-full bg-[#d4af37]" style={{ width: `${a.avgCompletion}%` }} />
                        </div>
                        <span className="text-[#94a3b8] font-mono text-xs">{a.avgCompletion}%</span>
                      </div>
                    ) : (
                      <span className="text-[#64748b]">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top 10 Projects */}
      <CollapsibleSection
        title="Top 10 by Contract Value"
        icon={TrendingUp}
        count={data.top10.length}
        accent="bg-[#d4af37]/20 text-[#d4af37]"
      >
        {data.top10.map((p: any, i: number) => (
          <div key={p.p3Id || i} className="flex items-center gap-3 px-4 py-3 border-b border-[#2d3a52]/50 last:border-0 hover:bg-[#2d3a52]/20">
            <span className="text-[#d4af37] font-mono text-sm w-6 text-right shrink-0">#{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{p.projectName}</p>
              <p className="text-[#64748b] text-xs">{p.subAgency} &middot; {formatCurrency(p.contractValue)}</p>
            </div>
            {p.completionPercent != null && (
              <span className="text-[#94a3b8] font-mono text-xs shrink-0">{p.completionPercent}%</span>
            )}
          </div>
        ))}
      </CollapsibleSection>
    </div>
  );
}
