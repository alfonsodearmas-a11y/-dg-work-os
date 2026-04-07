'use client';

import { useMemo } from 'react';
import { AlertTriangle, DollarSign, TrendingUp, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';
import { AGENCY_HEX_COLORS } from '@/lib/constants/agencies';
import { CHART_TOOLTIP_STYLE, CHART_AXIS_TICK, CHART_AXIS_LINE, chartResponsive } from '@/lib/chart-styles';
import { fmtCurrency, type DelayedSummary } from './types';

// ── KPI Card (AnalyticsKpiRow pattern) ─────────────────────────────────────

function KpiCard({ label, value, icon: Icon, accent, bgAccent, alert }: {
  label: string; value: string; icon: typeof AlertTriangle;
  accent: string; bgAccent: string; alert?: boolean;
}) {
  return (
    <div className={`relative rounded-xl border p-4 bg-gradient-to-b from-[#1a2744] to-[#0f1d32] overflow-hidden ${alert ? 'border-amber-500/30' : 'border-navy-800'}`}>
      {alert && <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />}
      <div className={`w-9 h-9 rounded-lg ${bgAccent} flex items-center justify-center mb-3`}>
        <Icon className={`w-[18px] h-[18px] ${accent}`} />
      </div>
      <p className="text-2xl font-bold text-white tracking-tight leading-none mb-1">{value}</p>
      <p className="text-xs text-navy-600 font-medium">{label}</p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function MinistrySummary({ summary, loading, isMobile }: {
  summary: DelayedSummary | null; loading: boolean; isMobile: boolean;
}) {
  if (loading || !summary) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-navy-800 p-4 bg-gradient-to-b from-[#1a2744] to-[#0f1d32] animate-pulse">
              <div className="w-9 h-9 rounded-lg bg-navy-800 mb-3" />
              <div className="h-7 w-16 bg-navy-800 rounded mb-1" />
              <div className="h-3 w-20 bg-navy-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Delayed Projects"
          value={summary.total_delayed.toLocaleString()}
          icon={AlertTriangle}
          accent="text-red-400"
          bgAccent="bg-red-500/15"
        />
        <KpiCard
          label="Value at Risk"
          value={fmtCurrency(summary.total_contract_value)}
          icon={DollarSign}
          accent="text-amber-400"
          bgAccent="bg-amber-500/15"
          alert
        />
        <KpiCard
          label="Avg Completion"
          value={`${summary.avg_completion}%`}
          icon={TrendingUp}
          accent="text-blue-400"
          bgAccent="bg-blue-500/15"
        />
        <KpiCard
          label="Past Deadline"
          value={summary.past_deadline_count.toLocaleString()}
          icon={Clock}
          accent={summary.past_deadline_count > 0 ? 'text-red-400' : 'text-emerald-400'}
          bgAccent={summary.past_deadline_count > 0 ? 'bg-red-500/15' : 'bg-emerald-500/15'}
          alert={summary.past_deadline_count > 0}
        />
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        <AgencyDonut summary={summary} isMobile={isMobile} />
        <CompletionDistribution bands={summary.completion_bands} isMobile={isMobile} />
      </div>

      {/* Row 3: Timeline Risk */}
      <TimelineRisk
        past={summary.past_deadline_count}
        within={summary.within_deadline_count}
        noDate={summary.no_date_count}
        total={summary.total_delayed}
      />
    </div>
  );
}

// ── Agency Donut ───────────────────────────────────────────────────────────

function AgencyDonut({ summary, isMobile }: { summary: DelayedSummary; isMobile: boolean }) {
  const data = useMemo(() =>
    summary.by_agency.map((a) => ({
      name: a.agency,
      value: a.count,
      color: AGENCY_HEX_COLORS[a.agency] || '#64748b',
      totalValue: a.total_value,
    })),
  [summary.by_agency]);

  if (data.length === 0) return null;

  return (
    <div className="card-premium p-5 h-full flex flex-col">
      <h3 className="text-sm font-semibold text-white mb-4">Projects by Agency</h3>
      <div className="flex items-center gap-6 flex-1">
        <div className={`relative ${isMobile ? 'w-28 h-28' : 'w-36 h-36'} shrink-0`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={isMobile ? 30 : 40}
                outerRadius={isMobile ? 50 : 64}
                paddingAngle={3}
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                {...CHART_TOOLTIP_STYLE}
                formatter={(value: number, name: string) => [`${value} projects`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-xl font-bold text-white leading-none">{summary.total_delayed}</p>
              <p className="text-[9px] text-navy-600 mt-0.5">total</p>
            </div>
          </div>
        </div>
        <div className="space-y-2.5 flex-1 min-w-0">
          {data.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-xs text-slate-300 truncate flex-1">{entry.name}</span>
              <span className="text-xs text-white font-medium tabular-nums">{entry.value}</span>
              <span className="text-[10px] text-navy-600 tabular-nums w-8 text-right">
                {Math.round((entry.value / summary.total_delayed) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Completion Distribution ────────────────────────────────────────────────

const BAND_COLORS = ['#ef4444', '#f59e0b', '#d4af37', '#10b981'];
const BAND_LABELS = ['0-25%', '26-50%', '51-75%', '76-100%'];

function CompletionDistribution({ bands, isMobile }: {
  bands: DelayedSummary['completion_bands']; isMobile: boolean;
}) {
  const resp = useMemo(() => chartResponsive(isMobile), [isMobile]);
  const data = useMemo(() => [
    { name: BAND_LABELS[0], count: bands['0_25'], fill: BAND_COLORS[0] },
    { name: BAND_LABELS[1], count: bands['26_50'], fill: BAND_COLORS[1] },
    { name: BAND_LABELS[2], count: bands['51_75'], fill: BAND_COLORS[2] },
    { name: BAND_LABELS[3], count: bands['76_100'], fill: BAND_COLORS[3] },
  ], [bands]);

  return (
    <div className="card-premium p-5 h-full flex flex-col">
      <h3 className="text-sm font-semibold text-white mb-4">Completion Distribution</h3>
      <div className={`flex-1 ${resp.heightClass}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_AXIS_LINE.stroke} vertical={false} />
            <XAxis dataKey="name" tick={resp.axisTick} stroke={CHART_AXIS_LINE.stroke} />
            <YAxis tick={resp.axisTick} stroke={CHART_AXIS_LINE.stroke} allowDecimals={false} width={resp.yAxisWidth} />
            <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(value: number) => [`${value} projects`]} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={resp.barSize(40)}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
              <LabelList dataKey="count" position="top" fill="#94a3b8" fontSize={resp.labelFontSize} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Timeline Risk ──────────────────────────────────────────────────────────

function TimelineRisk({ past, within, noDate, total }: {
  past: number; within: number; noDate: number; total: number;
}) {
  const safeDenom = total || 1;
  const rows = [
    { label: 'Past Deadline', count: past, dot: 'bg-red-400', bar: 'bg-red-500' },
    { label: 'Within Deadline', count: within, dot: 'bg-emerald-400', bar: 'bg-emerald-500' },
    { label: 'No Date Set', count: noDate, dot: 'bg-slate-400', bar: 'bg-slate-500' },
  ];

  return (
    <div className="card-premium p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Deadline Status</h3>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${r.dot} shrink-0`} />
            <span className="text-sm text-white flex-1">{r.label}</span>
            <span className="text-sm text-white font-bold tabular-nums w-8 text-right">{r.count}</span>
            <div className="w-24 h-2 bg-navy-800 rounded-full overflow-hidden shrink-0">
              <div className={`h-full rounded-full ${r.bar}`} style={{ width: `${(r.count / safeDenom) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
