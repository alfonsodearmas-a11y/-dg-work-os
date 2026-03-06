'use client';

import { useState, useEffect } from 'react';
import { Info } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { GPLMetricsRow, GPLSnapshotRow, AgeingBucket } from '@/lib/gpl/types';

interface StaffEntry {
  name: string;
  trackA_count: number;
  trackA_avg: number | null;
  design_count: number;
  design_avg: number | null;
  execution_count: number;
  execution_avg: number | null;
  total_count: number;
}

interface CompletedRecord {
  id: string;
  track: string;
  stage: string;
  account_number: string | null;
  customer_name: string | null;
  town_city: string | null;
  days_taken_calculated: number | null;
  days_taken: number | null;
  sla_target: number;
  is_breach: boolean;
  created_by: string | null;
  date_created: string | null;
  date_completed: string | null;
}

const HIST_COLORS = ['#059669', '#10b981', '#d4af37', '#f97316', '#dc2626', '#991b1b'];

function stageLabel(track: string, stage: string): string {
  if (track === 'A') return 'Simple Connections';
  if (stage === 'design') return 'Estimates & Designs';
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

export function EfficiencyStaff() {
  const [metrics, setMetrics] = useState<GPLMetricsRow[]>([]);
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [breaches, setBreaches] = useState<CompletedRecord[]>([]);
  const [trendSnapshots, setTrendSnapshots] = useState<GPLSnapshotRow[]>([]);
  const [trendMetrics, setTrendMetrics] = useState<GPLMetricsRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [latestRes, staffRes, breachRes, trendRes] = await Promise.all([
        fetch('/api/gpl/sc-latest'),
        fetch('/api/gpl/sc-staff'),
        fetch('/api/gpl/sc-completed?breach=true&pageSize=100'),
        fetch('/api/gpl/sc-trending?limit=20'),
      ]);
      if (latestRes.ok) {
        const d = await latestRes.json();
        setMetrics(d.metrics ?? []);
      }
      if (staffRes.ok) {
        const d = await staffRes.json();
        setStaff(d.staff ?? []);
      }
      if (breachRes.ok) {
        const d = await breachRes.json();
        setBreaches(d.records ?? []);
      }
      if (trendRes.ok) {
        const d = await trendRes.json();
        setTrendSnapshots(d.snapshots ?? []);
        setTrendMetrics(d.metrics ?? []);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const completedMetrics = metrics.filter(m => m.category === 'completed');

  return (
    <div className="space-y-6">
      {/* Section 1: Completion Efficiency Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {completedMetrics.map(m => (
          <EfficiencyCard key={`${m.track}:${m.stage}`} metric={m} />
        ))}
      </div>

      {/* Section 2: Staff Performance */}
      {staff.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Staff Performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2d3a52]">
                  <th className="text-left py-2 text-[#64748b] font-medium text-xs">Staff</th>
                  <th className="text-right py-2 text-[#64748b] font-medium text-xs">Simple</th>
                  <th className="text-right py-2 text-[#64748b] font-medium text-xs hidden md:table-cell">Avg Days</th>
                  <th className="text-right py-2 text-[#64748b] font-medium text-xs">Estimates</th>
                  <th className="text-right py-2 text-[#64748b] font-medium text-xs hidden md:table-cell">Avg Days</th>
                  <th className="text-right py-2 text-[#64748b] font-medium text-xs">Capital Works</th>
                  <th className="text-right py-2 text-[#64748b] font-medium text-xs hidden md:table-cell">Avg Days</th>
                  <th className="text-right py-2 text-[#64748b] font-medium text-xs">Total</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s.name} className="border-b border-[#2d3a52]/50">
                    <td className="py-2 text-white text-xs">{s.name}</td>
                    <td className="py-2 text-right text-[#94a3b8] text-xs">{s.trackA_count || '--'}</td>
                    <td className="py-2 text-right text-[#94a3b8] text-xs hidden md:table-cell">{s.trackA_avg !== null ? `${s.trackA_avg}d` : '--'}</td>
                    <td className="py-2 text-right text-[#94a3b8] text-xs">{s.design_count || '--'}</td>
                    <td className="py-2 text-right text-[#94a3b8] text-xs hidden md:table-cell">{s.design_avg !== null ? `${s.design_avg}d` : '--'}</td>
                    <td className="py-2 text-right text-[#94a3b8] text-xs">{s.execution_count || '--'}</td>
                    <td className="py-2 text-right text-[#94a3b8] text-xs hidden md:table-cell">{s.execution_avg !== null ? `${s.execution_avg}d` : '--'}</td>
                    <td className="py-2 text-right text-white text-xs font-medium">{s.total_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 3: Overdue Connections Register */}
      {breaches.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-red-400 mb-4">Overdue Connections ({breaches.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2d3a52]">
                  <th className="text-left py-2 text-[#64748b] font-medium text-xs">Account</th>
                  <th className="text-left py-2 text-[#64748b] font-medium text-xs">Customer</th>
                  <th className="text-left py-2 text-[#64748b] font-medium text-xs">Category</th>
                  <th className="text-right py-2 text-[#64748b] font-medium text-xs">Days</th>
                  <th className="text-right py-2 text-[#64748b] font-medium text-xs">Standard</th>
                  <th className="text-left py-2 text-[#64748b] font-medium text-xs hidden md:table-cell">Staff</th>
                </tr>
              </thead>
              <tbody>
                {breaches.slice(0, 50).map(r => {
                  const days = r.days_taken_calculated ?? r.days_taken ?? 0;
                  return (
                    <tr key={r.id} className="border-b border-[#2d3a52]/50">
                      <td className="py-2 text-[#94a3b8] font-mono text-xs">{r.account_number || '--'}</td>
                      <td className="py-2 text-white text-xs">{r.customer_name || '--'}</td>
                      <td className="py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          r.stage === 'design' ? 'bg-purple-500/20 text-purple-400'
                            : r.stage === 'execution' ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {stageLabel(r.track, r.stage)}
                        </span>
                      </td>
                      <td className="py-2 text-right text-red-400 text-xs font-medium">{days}d</td>
                      <td className="py-2 text-right text-[#64748b] text-xs">{r.sla_target}d</td>
                      <td className="py-2 text-[#94a3b8] text-xs hidden md:table-cell">{r.created_by || '--'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 4: Trend Charts */}
      {trendSnapshots.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SLATrendLine snapshots={trendSnapshots} metrics={trendMetrics} />
          <MedianTrendLine snapshots={trendSnapshots} metrics={trendMetrics} />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function EfficiencyCard({ metric }: { metric: GPLMetricsRow }) {
  const name = stageLabel(metric.track, metric.stage);
  const slaTarget = metric.sla_target_days;

  const buckets = (metric.ageing_buckets as AgeingBucket[]) || [];
  const data = buckets.map(b => ({ name: b.label, count: b.count }));

  // Count same-day and backdated entries (info-level, not errors)
  const infoCount = (metric.total_count ?? 0) - (metric.valid_count ?? 0) - (metric.error_count ?? 0);

  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-1 mb-3">
        <h4 className="text-xs font-semibold text-white">{name}</h4>
        <InfoTip text={`Percentage of completed connections that met the ${slaTarget}-day service standard.`} />
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <div className={`text-lg font-bold ${
            (metric.sla_compliance_pct ?? 0) >= 70 ? 'text-emerald-400'
              : (metric.sla_compliance_pct ?? 0) >= 50 ? 'text-amber-400'
              : 'text-red-400'
          }`}>{metric.sla_compliance_pct ?? 0}%</div>
          <div className="text-[10px] text-[#64748b]">completed within {slaTarget} days</div>
        </div>
        <div>
          <div className="text-lg font-bold text-white">{metric.mean_days ?? '--'}<span className="text-xs font-normal text-[#64748b]">d</span></div>
          <div className="text-[10px] text-[#64748b]">average</div>
        </div>
        <div>
          <div className="text-lg font-bold text-white">{metric.median_days ?? '--'}<span className="text-xs font-normal text-[#64748b]">d</span></div>
          <div className="flex items-center text-[10px] text-[#64748b]">
            typical time
            <InfoTip text="The middle value of all completion times. More reliable than the average when some connections took unusually long." />
          </div>
        </div>
      </div>
      {metric.trimmed_mean_days !== null && metric.trimmed_mean_days !== metric.mean_days && (
        <div className="flex items-center text-[10px] text-[#64748b] mb-2">
          typical time (excl. delays): {metric.trimmed_mean_days}d
          <InfoTip text="Average completion time after removing statistical outliers that would skew the number." />
        </div>
      )}
      {metric.error_count > 0 && (
        <div className="text-[10px] text-[#64748b] mb-2">
          {metric.error_count} records with date entry issues excluded from statistics
        </div>
      )}
      {data.length > 0 && (
        <div className="h-24 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 0, right: 5 }}>
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 8 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} width={20} />
              <Tooltip contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff', fontSize: 11 }} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} barSize={16}>
                {data.map((_, i) => (
                  <Cell key={i} fill={HIST_COLORS[i] || '#64748b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function fmtDate(s: string) {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SLATrendLine({ snapshots, metrics }: { snapshots: GPLSnapshotRow[]; metrics: GPLMetricsRow[] }) {
  const metricMap = new Map<string, GPLMetricsRow[]>();
  for (const m of metrics) {
    if (m.category !== 'completed') continue;
    if (!metricMap.has(m.snapshot_id)) metricMap.set(m.snapshot_id, []);
    metricMap.get(m.snapshot_id)!.push(m);
  }

  const data = snapshots.map(s => {
    const ms = metricMap.get(s.id) || [];
    return {
      date: fmtDate(s.snapshot_date),
      simple: ms.find(m => m.track === 'A')?.sla_compliance_pct ?? null,
      estimates: ms.find(m => m.stage === 'design')?.sla_compliance_pct ?? null,
      capitalWorks: ms.find(m => m.stage === 'execution')?.sla_compliance_pct ?? null,
    };
  });

  return (
    <div className="card-premium p-4">
      <h4 className="text-xs font-semibold text-white mb-3">On-time Rate Trend (Completed)</h4>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={30} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff', fontSize: 11 }} />
            <Line type="monotone" dataKey="simple" name="Simple" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="estimates" name="Estimates" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="capitalWorks" name="Capital Works" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MedianTrendLine({ snapshots, metrics }: { snapshots: GPLSnapshotRow[]; metrics: GPLMetricsRow[] }) {
  const metricMap = new Map<string, GPLMetricsRow[]>();
  for (const m of metrics) {
    if (m.category !== 'completed') continue;
    if (!metricMap.has(m.snapshot_id)) metricMap.set(m.snapshot_id, []);
    metricMap.get(m.snapshot_id)!.push(m);
  }

  const data = snapshots.map(s => {
    const ms = metricMap.get(s.id) || [];
    return {
      date: fmtDate(s.snapshot_date),
      simple: ms.find(m => m.track === 'A')?.median_days ?? null,
      estimates: ms.find(m => m.stage === 'design')?.median_days ?? null,
      capitalWorks: ms.find(m => m.stage === 'execution')?.median_days ?? null,
    };
  });

  return (
    <div className="card-premium p-4">
      <h4 className="text-xs font-semibold text-white mb-3">Typical Completion Time Trend</h4>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
            <Tooltip contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff', fontSize: 11 }} />
            <Line type="monotone" dataKey="simple" name="Simple" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="estimates" name="Estimates" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="capitalWorks" name="Capital Works" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
