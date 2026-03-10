'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  TrendingDown, TrendingUp, AlertTriangle, Clock, Info,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { GPLSnapshotRow, GPLMetricsRow, GPLChronicOutlierRow } from '@/lib/gpl/types';

interface LatestData {
  snapshot: GPLSnapshotRow | null;
  metrics: GPLMetricsRow[];
  previousSnapshot: GPLSnapshotRow | null;
  previousMetrics: GPLMetricsRow[];
}

interface TrendData {
  snapshots: GPLSnapshotRow[];
  metrics: GPLMetricsRow[];
}

function fmtDate(s: string) {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function stageLabel(track: string, stage: string): string {
  if (track === 'A') return 'Simple Connections';
  if (stage === 'design') return 'Estimates';
  return 'Capital Works';
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex ml-1 cursor-help">
      <Info className="h-3 w-3 text-[#64748b] group-hover:text-[#94a3b8] transition-colors" />
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 p-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] text-[10px] text-[#94a3b8] leading-tight opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
        {text}
      </span>
    </span>
  );
}

export function ExecutiveSummary() {
  const [latest, setLatest] = useState<LatestData | null>(null);
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [outliers, setOutliers] = useState<GPLChronicOutlierRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [latestRes, trendRes, outlierRes] = await Promise.all([
        fetch('/api/gpl/sc-latest'),
        fetch('/api/gpl/sc-trending?limit=20'),
        fetch('/api/gpl/sc-outliers'),
      ]);
      if (latestRes.ok) setLatest(await latestRes.json());
      if (trendRes.ok) setTrend(await trendRes.json());
      if (outlierRes.ok) {
        const d = await outlierRes.json();
        setOutliers(d.outliers ?? []);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" role="status" aria-label="Loading">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (!latest?.snapshot) {
    return (
      <div className="card-premium p-8 text-center">
        <p className="text-[#64748b]">No GPL service connection data yet. Upload an Excel file to get started.</p>
      </div>
    );
  }

  const { snapshot, metrics, previousSnapshot } = latest;

  const findMetric = (track: string, stage: string, category: string, source: GPLMetricsRow[] = metrics) =>
    source.find(m => m.track === track && m.stage === stage && m.category === category);

  const trackAOut = findMetric('A', 'metering', 'outstanding');
  const trackAComp = findMetric('A', 'metering', 'completed');
  const designOut = findMetric('B', 'design', 'outstanding');
  const execOut = findMetric('B', 'execution', 'outstanding');

  return (
    <div className="space-y-6">
      {/* Top Row: 4 Headline Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Simple Connections */}
        <div className="card-premium p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500" aria-label="Status: On Track" />
            <h4 className="text-xs font-semibold text-white">Simple Connections</h4>
            <InfoTip text="Applications where the existing network can support the new connection. GPL's standard is 3 days from application to meter installation." />
          </div>
          <div className="text-[10px] text-[#64748b] mb-3">No capital works required | 3-day standard</div>
          <div className="text-2xl font-bold text-white">{snapshot.track_a_outstanding}</div>
          <div className="text-[10px] text-[#64748b] mb-2">waiting</div>
          <DeltaIndicator current={snapshot.track_a_outstanding} previous={previousSnapshot?.track_a_outstanding ?? null} />
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#2d3a52]">
            <div>
              <div className="text-xs font-medium text-[#94a3b8]">{snapshot.track_a_completed}</div>
              <div className="text-[10px] text-[#64748b]">completed</div>
            </div>
            <div>
              {trackAComp?.sla_compliance_pct != null && (
                <>
                  <div className={`text-xs font-medium ${trackAComp.sla_compliance_pct >= 70 ? 'text-emerald-400' : trackAComp.sla_compliance_pct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {trackAComp.sla_compliance_pct}%
                  </div>
                  <div className="text-[10px] text-[#64748b]">on-time</div>
                </>
              )}
            </div>
          </div>
          {trackAOut?.median_days != null && (
            <div className="text-[10px] text-[#64748b] mt-1">typical wait {trackAOut.median_days}d</div>
          )}
        </div>

        {/* Card 2: Capital Works Pipeline */}
        <div className="card-premium p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-amber-500" aria-label="Status: Warning" />
            <h4 className="text-xs font-semibold text-white">Capital Works Pipeline</h4>
            <InfoTip text="Applications requiring new primary or secondary network infrastructure. The full process involves an estimate, customer payment, construction, then meter installation." />
          </div>
          <div className="text-[10px] text-[#64748b] mb-3">Full pipeline: Estimates + Construction + Metering</div>
          <div className="text-2xl font-bold text-white">{snapshot.track_b_total_outstanding}</div>
          <div className="text-[10px] text-[#64748b] mb-2">waiting (all stages)</div>
          <DeltaIndicator
            current={snapshot.track_b_total_outstanding}
            previous={previousSnapshot ? (previousSnapshot.track_b_design_outstanding + previousSnapshot.track_b_execution_outstanding) : null}
          />
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#2d3a52]">
            <div>
              <div className="text-xs font-medium text-[#94a3b8]">{(snapshot.track_b_design_completed ?? 0) + (snapshot.track_b_execution_completed ?? 0)}</div>
              <div className="text-[10px] text-[#64748b]">completed</div>
            </div>
            <div>
              {execOut?.median_days != null && (
                <>
                  <div className="text-xs font-medium text-[#94a3b8]">{execOut.median_days}d</div>
                  <div className="text-[10px] text-[#64748b]">typical wait</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Estimates Backlog */}
        <div className="card-premium p-4 border border-amber-500/30">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-amber-400" />
            <h4 className="text-xs font-semibold text-amber-400">Estimates Backlog</h4>
            <InfoTip text="GPL must produce a cost estimate within 12 days. The customer then pays, and GPL has 30 days to complete the connection." />
          </div>
          <div className="text-[10px] text-[#64748b] mb-3">Awaiting GPL to produce quotation | 12-day standard</div>
          <div className="text-2xl font-bold text-white">{snapshot.track_b_design_outstanding}</div>
          <div className="text-[10px] text-amber-400/70 mb-2">customers waiting for estimate</div>
          <DeltaIndicator current={snapshot.track_b_design_outstanding} previous={previousSnapshot?.track_b_design_outstanding ?? null} />
          <div className="pt-2 border-t border-[#2d3a52] space-y-1">
            <div className="text-[10px] text-[#94a3b8]">{snapshot.track_b_design_completed} estimates completed</div>
            {designOut?.sla_compliance_pct != null && (
              <div className={`text-[10px] ${designOut.sla_compliance_pct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                {designOut.sla_compliance_pct}% within 12-day standard
              </div>
            )}
            {snapshot.track_b_design_outstanding > 30 && (
              <div className="text-[10px] text-amber-400 mt-1">
                {snapshot.track_b_design_outstanding} customers waiting for GPL to provide a cost estimate. These cannot enter the 30-day connection timeline until the estimate is complete.
              </div>
            )}
          </div>
        </div>

        {/* Card 4: Chronic Delays */}
        <OutlierCard outliers={outliers} />
      </div>

      {/* Second Row: Sparkline Charts */}
      {trend && trend.snapshots.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TrendChart
            title="Waiting by Category"
            data={trend.snapshots.map(s => ({
              date: fmtDate(s.snapshot_date),
              simple: s.track_a_outstanding,
              estimates: s.track_b_design_outstanding,
              capitalWorks: s.track_b_execution_outstanding,
            }))}
            lines={[
              { key: 'simple', color: '#10b981', label: 'Simple' },
              { key: 'estimates', color: '#8b5cf6', label: 'Estimates' },
              { key: 'capitalWorks', color: '#f59e0b', label: 'Capital Works' },
            ]}
          />
          <SLATrendChart title="On-time Rate %" snapshots={trend.snapshots} metrics={trend.metrics} />
          <CompletionChart title="Completions" snapshots={trend.snapshots} />
        </div>
      )}

      {/* Third Row: Chronic Delays Alert Table */}
      {outliers.length > 0 && (
        <ChronicDelaysTable outliers={outliers} />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

const CHRONIC_PAGE_SIZE = 20;

function ChronicDelaysTable({ outliers }: { outliers: GPLChronicOutlierRow[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(outliers.length / CHRONIC_PAGE_SIZE);
  const pageRows = useMemo(
    () => outliers.slice(page * CHRONIC_PAGE_SIZE, (page + 1) * CHRONIC_PAGE_SIZE),
    [outliers, page],
  );

  // Reset to page 0 if data changes and current page is out of range
  useEffect(() => {
    if (page >= totalPages && totalPages > 0) setPage(0);
  }, [outliers.length, totalPages, page]);

  return (
    <div className="card-premium p-4 md:p-6">
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-400" />
        Chronic Delays ({outliers.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Chronic delays">
          <thead>
            <tr className="border-b border-[#2d3a52]">
              <th scope="col" className="text-left py-2 text-[#64748b] font-medium text-xs">Account</th>
              <th scope="col" className="text-left py-2 text-[#64748b] font-medium text-xs">Customer</th>
              <th scope="col" className="text-left py-2 text-[#64748b] font-medium text-xs hidden md:table-cell">Location</th>
              <th scope="col" className="text-left py-2 text-[#64748b] font-medium text-xs">Category</th>
              <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Days</th>
              <th scope="col" className="text-right py-2 text-[#64748b] font-medium text-xs">Snapshots</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(o => (
              <tr key={o.id} className="border-b border-[#2d3a52]/50">
                <td className="py-2 text-[#94a3b8] font-mono text-xs">{o.account_number}</td>
                <td className="py-2 text-white text-xs">{o.customer_name || '--'}</td>
                <td className="py-2 text-[#94a3b8] text-xs hidden md:table-cell">{o.town_city || '--'}</td>
                <td className="py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    o.stage === 'design' ? 'bg-purple-500/20 text-purple-400'
                      : o.stage === 'execution' ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {stageLabel(o.track, o.stage)}
                  </span>
                </td>
                <td className="py-2 text-right text-red-400 font-medium text-xs">{o.latest_days_elapsed}d</td>
                <td className="py-2 text-right text-[#64748b] text-xs">{o.consecutive_snapshots}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#2d3a52]">
          <button
            onClick={() => setPage(p => p - 1)}
            disabled={page === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:text-[#64748b] disabled:cursor-not-allowed text-white hover:bg-[#2d3a52]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </button>
          <span className="text-xs text-[#94a3b8]">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:text-[#64748b] disabled:cursor-not-allowed text-white hover:bg-[#2d3a52]"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function DeltaIndicator({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return null;
  const delta = current - previous;
  if (delta === 0) return null;
  return (
    <div className={`flex items-center gap-1 text-[10px] mb-2 ${delta <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
      {delta <= 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
      {delta > 0 ? '+' : ''}{delta} from previous
    </div>
  );
}

function OutlierCard({ outliers }: { outliers: GPLChronicOutlierRow[] }) {
  const byCategory = { simple: 0, estimates: 0, capitalWorks: 0 };
  let worstName = '--';
  let worstDays = 0;
  for (const o of outliers) {
    if (o.track === 'A') byCategory.simple++;
    else if (o.stage === 'design') byCategory.estimates++;
    else byCategory.capitalWorks++;
    if ((o.latest_days_elapsed ?? 0) > worstDays) {
      worstDays = o.latest_days_elapsed ?? 0;
      worstName = o.customer_name || o.account_number;
    }
  }

  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="h-4 w-4 text-red-400" />
        <h4 className="text-xs font-semibold text-white">Chronic Delays</h4>
        <InfoTip text="Applications that have exceeded twice the service standard across multiple reporting periods." />
      </div>
      <div className="text-[10px] text-[#64748b] mb-3">Exceeding 2x the service standard</div>
      <div className="text-2xl font-bold text-red-400">{outliers.length}</div>
      <div className="text-[10px] text-[#64748b] mb-2">delayed applications</div>
      <div className="pt-2 border-t border-[#2d3a52] space-y-1 text-[10px]">
        {byCategory.estimates > 0 && <div className="text-purple-400">{byCategory.estimates} Estimates</div>}
        {byCategory.capitalWorks > 0 && <div className="text-amber-400">{byCategory.capitalWorks} Capital Works</div>}
        {byCategory.simple > 0 && <div className="text-emerald-400">{byCategory.simple} Simple Connections</div>}
        {worstDays > 0 && (
          <div className="text-[#64748b] mt-1 truncate">Worst: {worstName} ({worstDays}d)</div>
        )}
      </div>
    </div>
  );
}

function TrendChart({ title, data, lines }: {
  title: string;
  data: Record<string, unknown>[];
  lines: { key: string; color: string; label: string }[];
}) {
  return (
    <div className="card-premium p-4">
      <h4 className="text-xs font-semibold text-white mb-3">{title}</h4>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
            <Tooltip contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff', fontSize: 12 }} />
            {lines.map(l => (
              <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[9px]">
        {lines.map(l => (
          <span key={l.key} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
            <span className="text-[#64748b]">{l.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SLATrendChart({ title, snapshots, metrics }: {
  title: string; snapshots: GPLSnapshotRow[]; metrics: GPLMetricsRow[];
}) {
  const metricMap = new Map<string, GPLMetricsRow[]>();
  for (const m of metrics) {
    if (m.category !== 'outstanding') continue;
    if (!metricMap.has(m.snapshot_id)) metricMap.set(m.snapshot_id, []);
    metricMap.get(m.snapshot_id)!.push(m);
  }

  const data = snapshots.map(s => {
    const ms = metricMap.get(s.id) || [];
    const find = (track: string, stage: string) => ms.find(m => m.track === track && m.stage === stage)?.sla_compliance_pct ?? null;
    return {
      date: fmtDate(s.snapshot_date),
      simple: find('A', 'metering'),
      estimates: find('B', 'design'),
      capitalWorks: find('B', 'execution'),
    };
  });

  return (
    <TrendChart
      title={title}
      data={data}
      lines={[
        { key: 'simple', color: '#10b981', label: 'Simple' },
        { key: 'estimates', color: '#8b5cf6', label: 'Estimates' },
        { key: 'capitalWorks', color: '#f59e0b', label: 'Capital Works' },
      ]}
    />
  );
}

function CompletionChart({ title, snapshots }: { title: string; snapshots: GPLSnapshotRow[] }) {
  const data = snapshots.map(s => ({
    date: fmtDate(s.snapshot_date),
    simple: s.track_a_completed,
    estimates: s.track_b_design_completed,
    capitalWorks: s.track_b_execution_completed,
  }));

  return (
    <div className="card-premium p-4">
      <h4 className="text-xs font-semibold text-white mb-3">{title}</h4>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
            <Tooltip contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff', fontSize: 12 }} />
            <Bar dataKey="simple" name="Simple" fill="#10b981" radius={[2, 2, 0, 0]} barSize={8} stackId="a" />
            <Bar dataKey="estimates" name="Estimates" fill="#8b5cf6" radius={[0, 0, 0, 0]} barSize={8} stackId="a" />
            <Bar dataKey="capitalWorks" name="Capital Works" fill="#f59e0b" radius={[2, 2, 0, 0]} barSize={8} stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[9px]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[#64748b]">Simple</span></span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" /><span className="text-[#64748b]">Estimates</span></span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-[#64748b]">Capital Works</span></span>
      </div>
    </div>
  );
}
