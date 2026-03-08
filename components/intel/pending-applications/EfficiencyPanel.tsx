'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Gauge, Clock, CheckCircle2, TrendingUp, Loader2, Sparkles,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Search, Filter, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, Legend, ComposedChart,
} from 'recharts';
import type {
  EfficiencyMetrics, MonthlyVolume, ServiceConnection,
  StageHistoryEntry, AIInsight,
} from '@/lib/service-connection-types';

// ── Sub-tab within Efficiency ────────────────────────────────────────────────

type SubTab = 'overview' | 'stages' | 'trends' | 'orders';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-red-500/50 bg-red-500/5',
  warning: 'border-amber-500/50 bg-amber-500/5',
  stable: 'border-blue-500/50 bg-blue-500/5',
  positive: 'border-emerald-500/50 bg-emerald-500/5',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-emerald-500/20 text-emerald-400',
  cancelled: 'bg-red-500/20 text-red-400',
  legacy_excluded: 'bg-gray-500/20 text-gray-400',
};

export function EfficiencyPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [metrics, setMetrics] = useState<EfficiencyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>('overview');

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/service-connections/stats');
      if (res.ok) setMetrics(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadMetrics(); }, [loadMetrics, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" role="status" aria-label="Loading">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      </div>
    );
  }

  // Zero-state: API returns metrics object with all zeros when no data exists
  if (!metrics || (metrics.totalOpen === 0 && metrics.totalCompleted === 0)) {
    return (
      <div className="card-premium p-8 text-center">
        <p className="text-[#64748b]">No service connection lifecycle data available yet. Upload GPL pending applications to start tracking completions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-tab selector */}
      <div className="flex items-center gap-1 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        {(['overview', 'stages', 'trends', 'orders'] as const).map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-3 py-2.5 sm:py-1.5 rounded-lg font-medium text-sm sm:text-xs whitespace-nowrap transition-colors ${
              subTab === t
                ? 'bg-[#d4af37]/20 text-[#d4af37]'
                : 'text-[#64748b] hover:text-white hover:bg-[#2d3a52]/50'
            }`}
          >
            {t === 'overview' ? 'Overview' : t === 'stages' ? 'Stage Analysis' : t === 'trends' ? 'Monthly Trends' : 'All Orders'}
          </button>
        ))}
      </div>

      {subTab === 'overview' && <OverviewSection metrics={metrics} />}
      {subTab === 'stages' && <StageSection metrics={metrics} />}
      {subTab === 'trends' && <TrendsSection />}
      {subTab === 'orders' && <OrdersSection />}
    </div>
  );
}

// ── Overview Section ──────────────────────────────────────────────────────────

function OverviewSection({ metrics }: { metrics: EfficiencyMetrics }) {
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const loadAI = async (regenerate = false) => {
    setAiLoading(true);
    try {
      if (!regenerate) {
        const res = await fetch('/api/service-connections/analysis/deep');
        if (res.ok) {
          const data = await res.json();
          if (data.analysis) { setAiInsight(data.analysis); setAiLoading(false); return; }
        }
      }
      const res = await fetch('/api/service-connections/analysis/deep', { method: 'POST' });
      if (res.ok) { const data = await res.json(); setAiInsight(data.analysis); }
    } catch { /* silent */ }
    setAiLoading(false);
  };

  const latestMonth = metrics.monthly.length > 0 ? metrics.monthly[metrics.monthly.length - 1] : null;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard icon={Clock} label="Avg Completion" value={`${metrics.overall.avgDays}d`} sub={`median ${metrics.overall.medianDays}d`} color="text-amber-400" />
        <KPICard
          icon={CheckCircle2} label="SLA Compliance" value={`${metrics.overall.slaPct}%`}
          sub={`${metrics.overall.completedCount} completed`}
          color={metrics.overall.slaPct >= 70 ? 'text-emerald-400' : metrics.overall.slaPct >= 50 ? 'text-amber-400' : 'text-red-400'}
        />
        <KPICard icon={TrendingUp} label="Monthly Throughput" value={latestMonth ? `${latestMonth.completed}` : '0'} sub={`${latestMonth?.opened || 0} opened`} color="text-blue-400" />
        <KPICard icon={Gauge} label="Queue Depth" value={`${metrics.totalOpen}`} sub={`${metrics.totalLegacy} legacy excluded`} color="text-purple-400" />
      </div>

      {/* Track A vs B vs Design */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TrackCard title="Track A — Fast-Track" subtitle="Meter installation (target ≤3d)" track={metrics.trackA} color="#10b981" tooltip={TRACK_TOOLTIPS['Track A']} />
        <TrackCard title="Track B — Networks" subtitle="Capital works execution (target ≤30d)" track={metrics.trackB} color="#f59e0b" tooltip={TRACK_TOOLTIPS['Track B']} />
        <TrackCard title="Design — Estimates" subtitle="Capital contribution quotes (target ≤12d)" track={metrics.design} color="#8b5cf6" tooltip={TRACK_TOOLTIPS['Design']} />
      </div>

      {/* Stage Duration Chart */}
      {metrics.stages.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Stage Duration vs SLA Target</h3>
          <div className="h-48 md:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.stages.map(s => ({ name: s.stage, avgDays: s.avgDays, slaTarget: s.slaTarget }))} margin={{ left: 10, right: 20 }}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff' }} formatter={(v: number, n: string) => [`${v}d`, n === 'avgDays' ? 'Avg Duration' : 'SLA Target']} />
                <Bar dataKey="avgDays" name="Avg Duration" radius={[4, 4, 0, 0]} barSize={24}>
                  {metrics.stages.map((s, i) => (
                    <Cell key={i} fill={s.avgDays <= s.slaTarget ? '#059669' : s.avgDays <= s.slaTarget * 2 ? '#d4af37' : '#dc2626'} />
                  ))}
                </Bar>
                <Bar dataKey="slaTarget" name="SLA Target" fill="#2d3a52" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-[#64748b]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-600" /> ≤ SLA</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#d4af37]" /> 1-2x SLA</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600" /> &gt;2x SLA</span>
          </div>
        </div>
      )}

      {/* AI Analysis */}
      <div className="card-premium p-4 md:p-6">
        <button onClick={() => { setAiOpen(!aiOpen); if (!aiOpen && !aiInsight && !aiLoading) loadAI(); }} className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#d4af37]" />
            <span className="text-sm font-semibold text-white">AI Efficiency Analysis</span>
          </div>
          {aiOpen ? <ChevronUp className="h-4 w-4 text-[#64748b]" /> : <ChevronDown className="h-4 w-4 text-[#64748b]" />}
        </button>
        {aiOpen && (
          <div className="mt-4 space-y-4">
            {aiLoading ? (
              <div className="flex items-center gap-2 py-8 justify-center">
                <Loader2 className="h-5 w-5 text-[#d4af37] animate-spin" />
                <span className="text-sm text-[#64748b]">Generating analysis...</span>
              </div>
            ) : aiInsight ? (
              <>
                <p className="text-sm text-[#94a3b8] leading-relaxed">{aiInsight.executiveSummary}</p>
                <div className="space-y-3">
                  {aiInsight.sections.map((section, i) => (
                    <div key={i} className={`rounded-lg border p-3 ${SEVERITY_COLORS[section.severity] || ''}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm sm:text-xs font-bold uppercase ${
                          section.severity === 'critical' ? 'text-red-400' : section.severity === 'warning' ? 'text-amber-400' : section.severity === 'positive' ? 'text-emerald-400' : 'text-blue-400'
                        }`}>{section.severity}</span>
                        <span className="text-sm font-medium text-white">{section.title}</span>
                      </div>
                      <p className="text-sm sm:text-xs text-[#94a3b8] mb-1">{section.summary}</p>
                      <p className="text-sm sm:text-xs text-[#64748b] leading-relaxed">{section.detail}</p>
                    </div>
                  ))}
                </div>
                {aiInsight.recommendations.length > 0 && (
                  <div>
                    <h4 className="text-sm sm:text-xs font-semibold text-white mb-2">Recommendations</h4>
                    <div className="space-y-2">
                      {aiInsight.recommendations.map((rec, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm sm:text-xs">
                          <span className={`shrink-0 px-1.5 py-0.5 rounded font-medium ${
                            rec.urgency === 'Immediate' ? 'bg-red-500/20 text-red-400' : rec.urgency === 'Short-term' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
                          }`}>{rec.urgency}</span>
                          <span className="text-[#94a3b8]">{rec.recommendation}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button onClick={() => loadAI(true)} className="text-xs text-[#d4af37] hover:text-[#f0d060]">Regenerate</button>
              </>
            ) : (
              <p className="text-sm text-[#64748b]">No analysis available.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stage Analysis Section ────────────────────────────────────────────────────

function StageSection({ metrics }: { metrics: EfficiencyMetrics }) {
  const [sortBy, setSortBy] = useState<'count' | 'avgDays' | 'slaPct'>('count');

  const stages = [...metrics.stages].sort((a, b) => {
    if (sortBy === 'avgDays') return b.avgDays - a.avgDays;
    if (sortBy === 'slaPct') return a.slaPct - b.slaPct;
    return b.count - a.count;
  });

  return (
    <div className="space-y-6">
      {/* Horizontal bar chart */}
      {stages.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Pipeline Stage Duration (Avg Days vs SLA)</h3>
          <div className="h-56 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stages.map(s => ({ name: s.stage, avgDays: s.avgDays, slaTarget: s.slaTarget }))} layout="vertical" margin={{ left: 10, right: 30 }}>
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff' }} formatter={(v: number, n: string) => [`${v}d`, n === 'avgDays' ? 'Avg Duration' : 'SLA Target']} />
                <Bar dataKey="slaTarget" name="SLA Target" fill="#2d3a52" radius={[0, 4, 4, 0]} barSize={14} />
                <Bar dataKey="avgDays" name="Avg Duration" radius={[0, 4, 4, 0]} barSize={14}>
                  {stages.map((s, i) => (
                    <Cell key={i} fill={s.avgDays <= s.slaTarget ? '#059669' : s.avgDays <= s.slaTarget * 2 ? '#d4af37' : '#dc2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card-premium p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Stage Breakdown</h3>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[#64748b] hidden sm:inline">Sort:</span>
            {(['count', 'avgDays', 'slaPct'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)} className={`px-2.5 py-1.5 sm:px-2 sm:py-1 rounded ${sortBy === s ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}>
                {s === 'count' ? 'Volume' : s === 'avgDays' ? 'Duration' : 'SLA'}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Pipeline stage breakdown">
            <thead>
              <tr className="border-b border-[#2d3a52]">
                <th scope="col" className="text-left py-2 text-[#64748b] font-medium text-xs">Stage</th>
                <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Orders</th>
                <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Avg</th>
                <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Median</th>
                <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Max</th>
                <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">SLA</th>
                <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Compliance</th>
              </tr>
            </thead>
            <tbody>
              {stages.map(s => (
                <tr key={s.stage} className="border-b border-[#2d3a52]/50 hover:bg-[#1a2744]/50">
                  <td className="py-2.5 font-medium text-white">{s.stage}</td>
                  <td className="py-2.5 text-right text-[#94a3b8]">{s.count}</td>
                  <td className="py-2.5 text-right"><span className={s.avgDays <= s.slaTarget ? 'text-emerald-400' : s.avgDays <= s.slaTarget * 2 ? 'text-amber-400' : 'text-red-400'}>{s.avgDays}d</span></td>
                  <td className="py-2.5 text-right text-[#94a3b8]">{s.medianDays}d</td>
                  <td className="py-2.5 text-right text-[#94a3b8]">{s.maxDays}d</td>
                  <td className="py-2.5 text-right text-[#64748b]">{s.slaTarget}d</td>
                  <td className="py-2.5 text-right">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${s.slaPct >= 70 ? 'bg-emerald-500/20 text-emerald-400' : s.slaPct >= 50 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>{s.slaPct}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Regional */}
      {metrics.regions.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Regional Distribution</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Regional distribution">
              <thead>
                <tr className="border-b border-[#2d3a52]">
                  <th scope="col" className="text-left py-2 text-[#64748b] font-medium text-xs">Region</th>
                  <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Open</th>
                  <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Completed</th>
                  <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Avg Days</th>
                </tr>
              </thead>
              <tbody>
                {metrics.regions.slice(0, 15).map(r => (
                  <tr key={r.region} className="border-b border-[#2d3a52]/50">
                    <td className="py-2 text-white">{r.region}</td>
                    <td className="py-2 text-right text-[#94a3b8]">{r.openCount}</td>
                    <td className="py-2 text-right text-[#94a3b8]">{r.completedCount}</td>
                    <td className="py-2 text-right text-[#94a3b8]">{r.avgDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Monthly Trends Section ────────────────────────────────────────────────────

function TrendsSection() {
  const [data, setData] = useState<MonthlyVolume[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/service-connections/trends?months=12');
        if (res.ok) { const json = await res.json(); setData(json.months || []); }
      } catch { /* silent */ }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20" role="status" aria-label="Loading"><div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" /></div>;
  if (data.length === 0) return <div className="card-premium p-8 text-center"><p className="text-[#64748b]">No monthly trend data yet. Data will appear after multiple uploads.</p></div>;

  const chartData = data.map(m => ({ ...m, label: fmtMonth(m.month) }));

  return (
    <div className="space-y-6">
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Monthly Volume: Opened vs Completed</h3>
        <div className="h-56 md:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ left: 0, right: 10 }}>
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <Bar yAxisId="left" dataKey="opened" name="Opened" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={16} />
              <Bar yAxisId="left" dataKey="completed" name="Completed" fill="#059669" radius={[4, 4, 0, 0]} barSize={16} />
              <Line yAxisId="right" type="monotone" dataKey="queueDepth" name="Queue Depth" stroke="#d4af37" strokeWidth={2} dot={{ fill: '#d4af37', r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Avg Completion Time (Days)</h3>
        <div className="h-48 md:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData.filter(d => d.avgDaysToComplete !== null)} margin={{ left: 0, right: 10 }}>
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff' }} formatter={(v: number) => [`${v}d`]} />
              <Line type="monotone" dataKey="avgDaysToComplete" name="Avg Days" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Monthly Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Monthly service connection summary">
            <thead>
              <tr className="border-b border-[#2d3a52]">
                <th scope="col" className="text-left py-2 text-[#64748b] font-medium text-xs">Month</th>
                <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Opened</th>
                <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Completed</th>
                <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Net</th>
                <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Queue</th>
                <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Avg Days</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map(m => (
                <tr key={m.month} className="border-b border-[#2d3a52]/50">
                  <td className="py-2 text-white">{fmtMonth(m.month)}</td>
                  <td className="py-2 text-right text-blue-400">{m.opened}</td>
                  <td className="py-2 text-right text-emerald-400">{m.completed}</td>
                  <td className={`py-2 text-right ${m.netChange > 0 ? 'text-red-400' : m.netChange < 0 ? 'text-emerald-400' : 'text-[#64748b]'}`}>{m.netChange > 0 ? '+' : ''}{m.netChange}</td>
                  <td className="py-2 text-right text-[#94a3b8]">{m.queueDepth}</td>
                  <td className="py-2 text-right text-[#94a3b8]">{m.avgDaysToComplete !== null ? `${m.avgDaysToComplete}d` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Orders Section ────────────────────────────────────────────────────────────

function OrdersSection() {
  const [orders, setOrders] = useState<ServiceConnection[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [track, setTrack] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '30');
    if (status) params.set('status', status);
    if (track) params.set('track', track);
    if (search) params.set('search', search);
    try {
      const res = await fetch(`/api/service-connections/list?${params}`);
      if (res.ok) { const json = await res.json(); setOrders(json.data || []); setTotal(json.total || 0); setTotalPages(json.totalPages || 1); }
    } catch { /* silent */ }
    setLoading(false);
  }, [page, status, track, search]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  return (
    <div className="space-y-4">
      <div className="card-premium p-3 md:p-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
            <input type="text" placeholder="Search name, customer ref, SO#..." value={searchInput}
              onChange={e => setSearchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); } }}
              aria-label="Search service connection orders"
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none" />
          </div>
          <button onClick={() => { setSearch(searchInput); setPage(1); }} className="btn-navy px-4 py-2 text-sm">Search</button>
          <button onClick={() => setShowFilters(!showFilters)} className={`p-2 rounded-lg border ${showFilters ? 'border-[#d4af37] text-[#d4af37]' : 'border-[#2d3a52] text-[#64748b]'}`}>
            <Filter className="h-4 w-4" />
          </button>
        </div>
        {showFilters && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#2d3a52]">
            <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
              aria-label="Filter by status"
              className="px-3 py-1.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:border-[#d4af37] focus:outline-none">
              <option value="">All Status</option><option value="open">Open</option><option value="completed">Completed</option><option value="legacy_excluded">Legacy</option>
            </select>
            <select value={track} onChange={e => { setTrack(e.target.value); setPage(1); }}
              aria-label="Filter by track"
              className="px-3 py-1.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:border-[#d4af37] focus:outline-none"
              title={track === 'A' ? TRACK_TOOLTIPS['Track A'] : track === 'B' ? TRACK_TOOLTIPS['Track B'] : track === 'Design' ? TRACK_TOOLTIPS['Design'] : 'Filter by connection track (A = meter only, B = capital works, Design = estimation phase)'}>
              <option value="">All Tracks</option><option value="A">Track A — Meter Only</option><option value="B">Track B — Capital Works</option><option value="Design">Design — Estimates</option><option value="unknown">Unknown</option>
            </select>
            {(status || track || search) && (
              <button onClick={() => { setStatus(''); setTrack(''); setSearch(''); setSearchInput(''); setPage(1); }} className="text-xs text-[#d4af37] hover:text-[#f0d060]">Clear</button>
            )}
          </div>
        )}
      </div>

      <div className="card-premium p-4 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12" role="status" aria-label="Loading"><div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" /></div>
        ) : orders.length === 0 ? (
          <p className="text-center text-[#64748b] py-8">No orders found.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Service connection orders">
                <thead>
                  <tr className="border-b border-[#2d3a52]">
                    <th scope="col" className="text-left py-2 text-[#64748b] font-medium text-xs w-8" />
                    <th scope="col" className="text-left py-2 text-[#64748b] font-medium text-xs">Customer</th>
                    <th scope="col" className="text-left py-2 text-[#64748b] font-medium text-xs hidden md:table-cell">SO #</th>
                    <th scope="col" className="text-left py-2 text-[#64748b] font-medium text-xs">Stage</th>
                    <th scope="col" className="text-left py-2 text-[#64748b] font-medium text-xs hidden md:table-cell cursor-help" title="Track A = meter installation only (≤3d). Track B = capital works required (≤30d). Design = estimation phase (≤12d).">Track</th>
                    <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Days</th>
                    <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => {
                    const name = `${order.first_name || ''} ${order.last_name || ''}`.trim() || '—';
                    const days = order.status === 'completed' ? order.total_days_to_complete
                      : order.application_date ? Math.round((Date.now() - new Date(order.application_date + 'T00:00:00Z').getTime()) / 86400000) : null;
                    const isExp = expanded === order.id;
                    return (
                      <OrderRowInner key={order.id} order={order} name={name} days={days} expanded={isExp} onToggle={() => setExpanded(isExp ? null : order.id)} />
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#2d3a52]">
                <span className="text-sm sm:text-xs text-[#64748b]">{total} orders · Page {page} of {totalPages}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2.5 sm:p-1.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] disabled:opacity-30"><ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" /></button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2.5 sm:p-1.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] disabled:opacity-30"><ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function OrderRowInner({ order, name, days, expanded, onToggle }: {
  order: ServiceConnection; name: string; days: number | null; expanded: boolean; onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-[#2d3a52]/50 hover:bg-[#1a2744]/50 cursor-pointer" onClick={onToggle}>
        <td className="py-3 sm:py-2.5">{expanded ? <ChevronUp className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-[#64748b]" /> : <ChevronDown className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-[#64748b]" />}</td>
        <td className="py-3 sm:py-2.5"><div className="text-white text-sm sm:text-xs font-medium">{name}</div><div className="text-xs text-[#64748b]">{order.customer_reference}</div></td>
        <td className="py-3 sm:py-2.5 text-[#94a3b8] text-sm sm:text-xs hidden md:table-cell">{order.service_order_number || '—'}</td>
        <td className="py-3 sm:py-2.5 text-[#94a3b8] text-sm sm:text-xs">{order.current_stage || '—'}</td>
        <td className="py-3 sm:py-2.5 text-sm sm:text-xs hidden md:table-cell">
          <span
            className={`cursor-help ${order.track === 'A' ? 'text-emerald-400' : order.track === 'B' ? 'text-amber-400' : order.track === 'Design' ? 'text-purple-400' : 'text-[#64748b]'}`}
            title={order.track === 'A' ? TRACK_TOOLTIPS['Track A'] : order.track === 'B' ? TRACK_TOOLTIPS['Track B'] : order.track === 'Design' ? TRACK_TOOLTIPS['Design'] : undefined}
          >
            {order.track === 'A' ? 'Track A' : order.track === 'B' ? 'Track B' : order.track === 'Design' ? 'Design' : '—'}
          </span>
        </td>
        <td className="py-3 sm:py-2.5 text-right text-sm sm:text-xs text-[#94a3b8]">{days !== null ? `${days}d` : '—'}</td>
        <td className="py-3 sm:py-2.5 text-right"><span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[order.status] || ''}`}>{order.status}</span></td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="py-3 px-4 bg-[#0f1d35]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm sm:text-xs mb-3">
              <div><span className="text-[#64748b]">Application Date:</span> <span className="text-white">{order.application_date || '—'}</span></div>
              <div><span className="text-[#64748b]">Account Type:</span> <span className="text-white">{order.account_type || '—'}</span></div>
              <div><span className="text-[#64748b]">SO Type:</span> <span className="text-white">{order.service_order_type || '—'}</span></div>
              <div><span className="text-[#64748b]">First Seen:</span> <span className="text-white">{order.first_seen_date || '—'}</span></div>
              <div><span className="text-[#64748b]">Last Seen:</span> <span className="text-white">{order.last_seen_date || '—'}</span></div>
              {order.disappeared_date && <div><span className="text-[#64748b]">Completed:</span> <span className="text-emerald-400">{order.disappeared_date}</span></div>}
              {order.linked_so_number && <div><span className="text-[#64748b]">Linked SO:</span> <span className="text-amber-400">{order.linked_so_number}</span></div>}
              <div><span className="text-[#64748b]">Region:</span> <span className="text-white">{order.region || '—'}</span></div>
            </div>
            {order.stage_history && (order.stage_history as StageHistoryEntry[]).length > 0 && (
              <div>
                <span className="text-[#64748b] text-sm sm:text-xs font-medium">Stage History</span>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-1">
                  {(order.stage_history as StageHistoryEntry[]).map((entry, i) => (
                    <div key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-[#2d3a52]">→</span>}
                      <span className="px-2 py-1 rounded bg-[#1a2744] border border-[#2d3a52] text-xs">
                        <span className="text-white">{entry.stage}</span>
                        {entry.days !== null && <span className="text-[#64748b] ml-1">({entry.days}d)</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function KPICard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-2 mb-2"><Icon className={`h-4 w-4 ${color}`} /><span className="text-sm sm:text-xs text-[#64748b]">{label}</span></div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm sm:text-xs text-[#64748b] mt-1">{sub}</div>
    </div>
  );
}

const TRACK_TOOLTIPS: Record<string, string> = {
  'Track A': 'Track A — Standard connections that only require meter installation. No infrastructure or capital works needed. SLA: ≤3 days.',
  'Track B': 'Track B — Complex connections requiring capital works (line extensions, transformer upgrades, pole installations) before the meter can be installed. Stages: Design → Execution → Metering. SLA: ≤30 days.',
  'Design': 'Design — Connections currently in the design/estimation phase before capital works begin (quotations, capital contribution assessments). SLA: ≤12 days.',
};

function TrackCard({ title, subtitle, track, color, tooltip }: { title: string; subtitle: string; track: { completedCount: number; avgDays: number; medianDays: number; slaPct: number; slaTarget: number; openCount: number }; color: string; tooltip?: string }) {
  return (
    <div className="card-premium p-4 group relative" title={tooltip}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <div>
          <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
            {title}
            {tooltip && <span className="inline-flex items-center justify-center w-4 h-4 sm:w-3.5 sm:h-3.5 rounded-full border border-[#64748b]/50 text-xs sm:text-[9px] text-[#64748b] font-normal cursor-help">?</span>}
          </h4>
          <p className="text-xs text-[#64748b]">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><div className="text-lg font-bold text-white">{track.completedCount}</div><div className="text-xs text-[#64748b]">completed</div></div>
        <div><div className="text-lg font-bold text-white">{track.avgDays}<span className="text-xs font-normal text-[#64748b]">d</span></div><div className="text-xs text-[#64748b]">avg (≤{track.slaTarget}d)</div></div>
        <div><div className={`text-lg font-bold ${track.slaPct >= 70 ? 'text-emerald-400' : track.slaPct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{track.slaPct}%</div><div className="text-xs text-[#64748b]">SLA</div></div>
      </div>
      <div className="mt-3 pt-2 border-t border-[#2d3a52]"><span className="text-sm sm:text-xs text-[#64748b]">{track.openCount} currently open</span></div>
    </div>
  );
}

function fmtMonth(month: string): string {
  const [year, m] = month.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${year}`;
}
