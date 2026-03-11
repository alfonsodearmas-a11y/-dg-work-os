'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, Loader2, Brain, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Search, X, ArrowUpDown, ClipboardList, Gauge } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { EfficiencyPanel } from './EfficiencyPanel';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { CHART_THEME } from '@/lib/constants/chart-theme';
import type { GPLAnalysis, DeepAnalysisResult, PendingApplication } from '@/lib/pending-applications-types';

const STAGE_COLORS: Record<string, string> = {
  Metering: '#f59e0b',
  Designs: '#3b82f6',
  Execution: '#8b5cf6',
  Survey: '#06b6d4',
  Estimation: '#10b981',
  Approval: '#ec4899',
  Other: '#64748b',
};

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  warning: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  stable: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  positive: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
};

function getBadgeColor(days: number) {
  if (days > 30) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (days >= 15) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  if (days >= 7) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
}

function fmtDate(s: string) {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function GPLAnalysisPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [view, setView] = useState<'pending' | 'efficiency'>('pending');

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex items-center gap-1 text-sm sm:text-xs">
        <button
          onClick={() => setView('pending')}
          className={`flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-lg font-medium transition-colors ${
            view === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'text-navy-600 hover:text-white hover:bg-navy-800/50'
          }`}
        >
          <ClipboardList className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          Pending Analysis
        </button>
        <button
          onClick={() => setView('efficiency')}
          className={`flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-lg font-medium transition-colors ${
            view === 'efficiency' ? 'bg-amber-500/20 text-amber-400' : 'text-navy-600 hover:text-white hover:bg-navy-800/50'
          }`}
        >
          <Gauge className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          Efficiency Tracking
        </button>
      </div>

      {view === 'efficiency' ? <EfficiencyPanel refreshKey={refreshKey} /> : <GPLPendingAnalysis />}
    </div>
  );
}

function GPLPendingAnalysis() {
  const [analysis, setAnalysis] = useState<GPLAnalysis | null>(null);
  const [deepAnalysis, setDeepAnalysis] = useState<DeepAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Records state
  const [records, setRecords] = useState<PendingApplication[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [sortBy, setSortBy] = useState('days_waiting');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Debounce search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchQuery(value), 300);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [analysisRes, deepRes] = await Promise.all([
          fetch('/api/pending-applications/analysis?agency=GPL'),
          fetch('/api/pending-applications/analysis/deep?agency=GPL'),
        ]);
        if (analysisRes.ok) {
          const data = await analysisRes.json();
          setAnalysis(data.analysis);
        }
        if (deepRes.ok) {
          const data = await deepRes.json();
          if (data.analysis) setDeepAnalysis(data.analysis);
        }
      } catch (err) {
        setError('Failed to load analysis');
        console.error(err);
      }
      setLoading(false);
    }
    load();
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoadingRecords(true);
    const params = new URLSearchParams();
    params.set('agency', 'GPL');
    params.set('page', String(page));
    params.set('pageSize', '50');
    params.set('sortBy', sortBy);
    params.set('order', sortOrder);
    if (searchQuery) params.set('search', searchQuery);
    if (stageFilter) params.set('stage', stageFilter);
    try {
      const res = await fetch(`/api/pending-applications?${params}`);
      const data = await res.json();
      setRecords(data.records || []);
      setTotalRecords(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch { /* silent */ }
    setLoadingRecords(false);
  }, [searchQuery, stageFilter, sortBy, sortOrder, page]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);
  useEffect(() => { setPage(1); }, [searchQuery, stageFilter, sortBy, sortOrder]);

  const handleSort = (col: string) => {
    if (sortBy === col) setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder(col === 'days_waiting' ? 'desc' : 'asc'); }
  };

  const generateDeepAnalysis = async () => {
    setGeneratingAI(true);
    setError(null);
    try {
      const res = await fetch('/api/pending-applications/analysis/deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency: 'GPL' }),
      });
      const data = await res.json();
      if (res.ok && data.analysis) {
        setDeepAnalysis(data.analysis);
      } else {
        setError(data.error || 'AI analysis failed');
      }
    } catch {
      setError('Network error');
    }
    setGeneratingAI(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="border-amber-400" /></div>;
  }

  if (!analysis) {
    return <div className="card-premium p-8 text-center"><p className="text-navy-600">No GPL records found. Upload a GPL pending applications file first.</p></div>;
  }

  const agingData = analysis.agingBuckets.map(b => ({
    name: b.label,
    count: b.count,
    pct: b.pct,
  }));

  const AGING_COLORS = ['#059669', '#10b981', '#d4af37', '#f97316', '#dc2626', '#991b1b'];
  const stages = analysis.pipeline.map(s => s.stage);

  return (
    <div className="space-y-6">
      {/* Pipeline Funnel */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Pipeline Funnel — SLA Compliance</h3>
        <div className="space-y-3">
          {analysis.pipeline.map(stage => {
            const color = STAGE_COLORS[stage.stage] || '#64748b';
            return (
              <div key={stage.stage} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white font-medium">{stage.stage}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-navy-600">{stage.count} orders</span>
                    <span className="text-navy-600">avg {stage.avgDays}d</span>
                    <span className="text-navy-600">SLA {stage.slaDays}d</span>
                    <span className={stage.compliancePct >= 70 ? 'text-emerald-400' : stage.compliancePct >= 40 ? 'text-amber-400' : 'text-red-400'}>
                      {stage.compliancePct}% compliant
                    </span>
                  </div>
                </div>
                <div className="relative h-6 rounded-lg bg-navy-950 border border-navy-800 overflow-hidden">
                  <div className="absolute inset-0 rounded-lg" style={{ backgroundColor: color, opacity: 0.15 }} />
                  <div
                    className="absolute inset-y-0 left-0 rounded-lg"
                    style={{ width: `${stage.compliancePct}%`, backgroundColor: color, opacity: 0.7 }}
                  />
                  <div
                    className="absolute inset-y-0 rounded-lg bg-red-500/50"
                    style={{ left: `${stage.compliancePct}%`, width: `${100 - stage.compliancePct}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-between px-3 text-xs font-medium text-white">
                    <span>{stage.slaCompliant} OK</span>
                    {stage.slaBreached > 0 && <span className="text-red-300">{stage.slaBreached} breached</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Aging Buckets */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Aging Distribution</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={agingData} margin={{ left: 0, right: 10 }}>
              <XAxis dataKey="name" tick={{ fill: CHART_THEME.colors.slate400, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CHART_THEME.colors.navy600, fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={CHART_THEME.tooltip}
                formatter={(value: number, _name: string, props: { payload?: { pct: number } }) => [`${value} (${props.payload?.pct ?? 0}%)`, 'Count']}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={32}>
                {agingData.map((_entry, i) => (
                  <Cell key={i} fill={AGING_COLORS[i] || CHART_THEME.colors.navy600} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Account Types */}
      {analysis.accountTypes.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Account Types</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="GPL account types">
              <thead>
                <tr className="text-navy-600 text-xs uppercase tracking-wider border-b border-navy-800">
                  <th scope="col" className="text-left py-2 pr-4">Type</th>
                  <th scope="col" className="text-right py-2 px-3">Count</th>
                  <th scope="col" className="text-right py-2 pl-3">Avg Wait</th>
                </tr>
              </thead>
              <tbody>
                {analysis.accountTypes.slice(0, 10).map(a => (
                  <tr key={a.type} className="border-b border-navy-800/50">
                    <td className="py-2.5 pr-4 text-white">{a.type}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">{a.count}</td>
                    <td className="py-2.5 pl-3 text-right text-slate-400">{a.avgDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Red Flags */}
      {analysis.redFlags.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-red-400 mb-3">Red Flags</h3>
          <div className="space-y-2">
            {analysis.redFlags.map((flag, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <span className="text-slate-400">{flag}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Individual Applications */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">All GPL Applications ({totalRecords})</h3>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-600" />
            <input
              type="text"
              placeholder="Search name, reference, address..."
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              aria-label="Search GPL applications"
              className="w-full pl-10 pr-10 py-3 sm:py-2 rounded-lg bg-navy-950 border border-navy-800 text-white text-base sm:text-sm placeholder:text-navy-600 focus:border-gold-500 focus:outline-none"
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearchQuery(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-600 hover:text-white p-1">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="relative">
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
              aria-label="Filter by pipeline stage"
              className="appearance-none w-full pl-3 pr-8 py-3 sm:py-2 rounded-lg bg-navy-950 border border-navy-800 text-slate-400 text-base sm:text-sm focus:border-gold-500 focus:outline-none cursor-pointer">
              <option value="">All Stages</option>
              {stages.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-600 pointer-events-none" />
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm" aria-label="GPL pending applications">
            <thead>
              <tr className="text-navy-600 text-xs uppercase tracking-wider border-b border-navy-800 bg-navy-950/50">
                <SortHeader label="Name" field="last_name" current={sortBy} order={sortOrder} onSort={handleSort} />
                <th scope="col" className="text-left py-3 px-3">Customer#</th>
                <th scope="col" className="text-left py-3 px-3">Stage</th>
                <th scope="col" className="text-left py-3 px-3">Town/City</th>
                <SortHeader label="Days" field="days_waiting" current={sortBy} order={sortOrder} onSort={handleSort} />
                <SortHeader label="Applied" field="application_date" current={sortBy} order={sortOrder} onSort={handleSort} />
                <th scope="col" className="text-left py-3 px-3">Account Type</th>
              </tr>
            </thead>
            <tbody>
              {loadingRecords ? (
                <tr><td colSpan={7} className="py-12 text-center"><Spinner className="border-amber-400 mx-auto" /></td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-navy-600">No records found</td></tr>
              ) : records.map(r => (
                <RecordRow key={r.id} record={r} expanded={expandedId === r.id} onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-2">
          {loadingRecords ? (
            <div className="py-12 text-center"><Spinner className="border-amber-400 mx-auto" /></div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center text-navy-600">No records found</div>
          ) : records.map(r => (
            <MobileCard key={r.id} record={r} expanded={expandedId === r.id} onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)} />
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-navy-800">
            <span className="text-sm sm:text-xs text-navy-600">{totalRecords} records · Page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-2.5 sm:p-1.5 rounded-lg bg-navy-950 border border-navy-800 hover:border-gold-500 text-slate-400 disabled:opacity-30">
                <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-2.5 sm:p-1.5 rounded-lg bg-navy-950 border border-navy-800 hover:border-gold-500 text-slate-400 disabled:opacity-30">
                <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI Deep Analysis */}
      <div className="card-premium p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-gold-500" />
            <h3 className="text-sm font-semibold text-white">AI Deep Analysis</h3>
          </div>
          <button
            onClick={generateDeepAnalysis}
            disabled={generatingAI}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-navy-900 border border-navy-800 hover:border-gold-500 text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            {generatingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {deepAnalysis ? 'Regenerate' : 'Generate'}
          </button>
        </div>

        {generatingAI && (
          <div className="flex items-center justify-center gap-3 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gold-500" />
            <span className="text-sm text-navy-600">Generating AI analysis (this may take a minute)...</span>
          </div>
        )}

        {!generatingAI && deepAnalysis && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400 leading-relaxed">{deepAnalysis.executiveSummary}</p>

            {deepAnalysis.sections?.map((section, i) => {
              const sev = SEVERITY_CONFIG[section.severity] || SEVERITY_CONFIG.stable;
              return <BriefingSection key={i} section={section} sev={sev} />;
            })}

            {deepAnalysis.recommendations && deepAnalysis.recommendations.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs text-navy-600 uppercase tracking-wider font-semibold mb-2">Recommendations</h4>
                <div className="space-y-2">
                  {deepAnalysis.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-navy-950 border border-navy-800">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${
                        rec.urgency === 'Immediate' ? 'bg-red-500/20 text-red-400' :
                        rec.urgency === 'Short-term' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>{rec.urgency}</span>
                      <div>
                        <p className="text-sm text-white">{rec.recommendation}</p>
                        <p className="text-xs text-navy-600 mt-0.5">{rec.category}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-navy-600">
              Generated {deepAnalysis.createdAt ? new Date(deepAnalysis.createdAt).toLocaleString() : 'just now'}
            </p>
          </div>
        )}

        {!generatingAI && !deepAnalysis && (
          <p className="text-sm text-navy-600 py-4">Click Generate to create an AI-powered deep analysis of GPL pending applications.</p>
        )}

        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SortHeader({ label, field, current, order, onSort }: { label: string; field: string; current: string; order: 'asc' | 'desc'; onSort: (f: string) => void }) {
  return (
    <th scope="col" className="text-left py-3 px-3 cursor-pointer hover:text-white transition-colors select-none whitespace-nowrap" onClick={() => onSort(field)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${current === field ? 'text-gold-500' : ''}`} />
      </span>
    </th>
  );
}

function RecordRow({ record: r, expanded, onToggle }: { record: PendingApplication; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr onClick={onToggle} className="border-b border-navy-800/50 hover:bg-navy-900/50 cursor-pointer transition-colors">
        <td className="py-3 px-3 text-white font-medium">{r.firstName} {r.lastName}</td>
        <td className="py-3 px-3 text-slate-400 font-mono text-xs">{r.customerReference || '—'}</td>
        <td className="py-3 px-3">
          {r.pipelineStage && (
            <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: (STAGE_COLORS[r.pipelineStage] || '#64748b') + '33', color: STAGE_COLORS[r.pipelineStage] || '#94a3b8' }}>
              {r.pipelineStage}
            </span>
          )}
        </td>
        <td className="py-3 px-3 text-slate-400">{r.region || '—'}</td>
        <td className="py-3 px-3">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${getBadgeColor(r.daysWaiting)}`}>{r.daysWaiting}d</span>
        </td>
        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{fmtDate(r.applicationDate)}</td>
        <td className="py-3 px-3 text-slate-400 text-xs">{r.accountType || '—'}</td>
      </tr>
      {expanded && (
        <tr className="bg-navy-950/80">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <DetailItem label="Customer#" value={r.customerReference} />
              <DetailItem label="Account Type" value={r.accountType} />
              <DetailItem label="Account Status" value={r.accountStatus} />
              <DetailItem label="Service Order" value={r.serviceOrderNumber} />
              <DetailItem label="SO Type" value={r.serviceOrderType} />
              <DetailItem label="Town/City" value={r.region} />
              <DetailItem label="Address" value={r.villageWard} />
              <DetailItem label="Cycle" value={r.cycle} />
              <DetailItem label="Division" value={r.divisionCode} />
              <DetailItem label="Applied" value={fmtDate(r.applicationDate)} />
              <DetailItem label="Days Waiting" value={`${r.daysWaiting}`} />
              <DetailItem label="Telephone" value={r.telephone} />
              <DetailItem label="Data As Of" value={fmtDate(r.dataAsOf)} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MobileCard({ record: r, expanded, onToggle }: { record: PendingApplication; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl bg-navy-950 border border-navy-800 overflow-hidden" onClick={onToggle}>
      <div className="p-3 flex items-center justify-between cursor-pointer min-h-[56px]">
        <div className="min-w-0">
          <div className="text-sm text-white font-medium truncate">{r.firstName} {r.lastName}</div>
          <div className="flex items-center gap-2 mt-1 text-sm sm:text-xs text-navy-600">
            {r.pipelineStage && <span className="px-1.5 py-0.5 rounded text-sm sm:text-xs" style={{ backgroundColor: (STAGE_COLORS[r.pipelineStage] || '#64748b') + '33', color: STAGE_COLORS[r.pipelineStage] || '#94a3b8' }}>{r.pipelineStage}</span>}
            <span>{r.region || '—'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex px-2 py-1 rounded-full text-sm sm:text-xs font-semibold border ${getBadgeColor(r.daysWaiting)}`}>{r.daysWaiting}d</span>
          <ChevronDown className={`h-5 w-5 text-navy-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-navy-800/50 pt-2 space-y-2">
          <DetailItem label="Customer#" value={r.customerReference} />
          <DetailItem label="Account Type" value={r.accountType} />
          <DetailItem label="Account Status" value={r.accountStatus} />
          <DetailItem label="Service Order" value={r.serviceOrderNumber} />
          <DetailItem label="Address" value={r.villageWard} />
          <DetailItem label="Cycle" value={r.cycle} />
          <DetailItem label="Applied" value={fmtDate(r.applicationDate)} />
          <DetailItem label="Telephone" value={r.telephone} />
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="text-sm sm:text-xs">
      <span className="text-navy-600">{label}: </span>
      <span className="text-slate-400">{value}</span>
    </div>
  );
}

function BriefingSection({ section, sev }: { section: { title: string; severity: string; summary: string; detail: string }; sev: { bg: string; text: string; border: string } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`rounded-xl border ${sev.border} overflow-hidden`}>
      <button type="button" onClick={() => setExpanded(!expanded)} className="w-full text-left px-4 py-3 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-white">{section.title}</span>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${sev.bg} ${sev.text}`}>{section.severity}</span>
            <ChevronDown className={`w-4 h-4 text-navy-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
        <p className="text-sm text-slate-400">{section.summary}</p>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-sm text-slate-400 leading-relaxed">{section.detail}</p>
          </div>
        </div>
      )}
    </div>
  );
}
