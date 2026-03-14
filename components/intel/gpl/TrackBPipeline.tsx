'use client';

import { useState, useEffect } from 'react';
import { ArrowRight, Clock, Info, TrendingDown, TrendingUp } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { CHART_THEME } from '@/lib/constants/chart-theme';
import type { GPLMetricsRow, GPLOutstandingRow, AgeingBucket } from '@/lib/gpl/types';

interface PipelineStage {
  outstanding: number;
  completed: number;
  metrics: { outstanding: GPLMetricsRow | null; completed: GPLMetricsRow | null };
}

interface PipelineSnapshot {
  snapshotDate: string;
  design: PipelineStage;
  execution: PipelineStage;
}

interface PipelineData {
  pipeline: PipelineSnapshot | null;
  previousPipeline: PipelineSnapshot | null;
}

const AGEING_COLORS = ['#059669', '#10b981', '#d4af37', '#f97316', '#dc2626', '#991b1b'];

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex ml-1 cursor-help">
      <Info className="h-3 w-3 text-navy-600 group-hover:text-slate-400 transition-colors" />
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 p-2 rounded-lg bg-navy-900 border border-navy-800 text-[10px] text-slate-400 leading-tight opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
        {text}
      </span>
    </span>
  );
}

export function TrackBPipeline() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [records, setRecords] = useState<GPLOutstandingRow[]>([]);
  const [recordStage, setRecordStage] = useState<'design' | 'execution'>('design');
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/gpl/sc-pipeline');
      if (res.ok) setData(await res.json());
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    async function loadRecords() {
      setRecordsLoading(true);
      const res = await fetch(`/api/gpl/sc-outstanding?track=B&stage=${recordStage}&pageSize=100`);
      if (res.ok) {
        const d = await res.json();
        setRecords(d.records ?? []);
      }
      setRecordsLoading(false);
    }
    if (!loading) loadRecords();
  }, [recordStage, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="border-amber-400" />
      </div>
    );
  }

  if (!data?.pipeline) {
    return (
      <div className="card-premium p-8 text-center">
        <p className="text-navy-600">No capital works pipeline data available.</p>
      </div>
    );
  }

  const { pipeline, previousPipeline } = data;
  const prevDate = previousPipeline?.snapshotDate;

  const fmtDate = (s: string) => {
    const d = new Date(s + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const fmtDateShort = (s: string) => {
    const d = new Date(s + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const dOut = pipeline.design.metrics.outstanding;
  const dComp = pipeline.design.metrics.completed;
  const eOut = pipeline.execution.metrics.outstanding;
  const eComp = pipeline.execution.metrics.completed;

  return (
    <div className="space-y-6">
      {/* Data freshness */}
      {pipeline.snapshotDate && (
        <div className="flex items-center gap-2 text-xs text-navy-600">
          <Clock className="h-3.5 w-3.5" />
          <span>Data as of <span className="text-slate-400">{fmtDate(pipeline.snapshotDate)}</span></span>
        </div>
      )}

      {/* Section 1: Pipeline Funnel */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Capital Works Pipeline</h3>
        <div className="flex flex-col md:flex-row items-stretch gap-3 md:gap-2">
          {/* STEP 1: Estimate & Design */}
          <div className="card-premium p-3 flex-1 min-w-[140px]" style={{ borderColor: '#8b5cf640' }}>
            <div className="text-[9px] font-medium text-navy-600 uppercase tracking-wider mb-1">Step 1</div>
            <div className="text-xs font-semibold text-white mb-1">Estimate & Design</div>
            <div className="text-[10px] text-navy-600 mb-3">GPL produces the cost quotation</div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-white">{pipeline.design.outstanding}</div>
                <div className="text-[9px] text-navy-600">waiting</div>
                <InlineDelta current={pipeline.design.outstanding} previous={previousPipeline?.design.outstanding} dateLabel={prevDate ? fmtDateShort(prevDate) : undefined} />
              </div>
              <div>
                <div className="text-lg font-bold text-emerald-400">{pipeline.design.completed}</div>
                <div className="text-[9px] text-navy-600">completed</div>
                <InlineDelta current={pipeline.design.completed} previous={previousPipeline?.design.completed} dateLabel={prevDate ? fmtDateShort(prevDate) : undefined} invert />
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-navy-800 text-[10px] text-navy-600">
              12-day standard
            </div>
          </div>

          {/* Arrow + label between Step 1 and 2 */}
          <div className="flex flex-col items-center justify-center gap-1 shrink-0 py-2 px-1">
            <ArrowRight className="h-5 w-5 text-navy-800 hidden md:block" />
            <div className="text-[8px] text-navy-600 text-center max-w-[100px] leading-tight">
              Customer accepts quotation & satisfies Standard Terms and Conditions
            </div>
          </div>

          {/* STEP 2: Construction */}
          <div className="card-premium p-3 flex-1 min-w-[140px]" style={{ borderColor: '#f59e0b40' }}>
            <div className="text-[9px] font-medium text-navy-600 uppercase tracking-wider mb-1">Step 2</div>
            <div className="text-xs font-semibold text-white mb-1">Construction</div>
            <div className="text-[10px] text-navy-600 mb-3">Network build-out after customer pays</div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-white">{pipeline.execution.outstanding}</div>
                <div className="text-[9px] text-navy-600">waiting</div>
                <InlineDelta current={pipeline.execution.outstanding} previous={previousPipeline?.execution.outstanding} dateLabel={prevDate ? fmtDateShort(prevDate) : undefined} />
              </div>
              <div>
                <div className="text-lg font-bold text-emerald-400">{pipeline.execution.completed}</div>
                <div className="text-[9px] text-navy-600">completed</div>
                <InlineDelta current={pipeline.execution.completed} previous={previousPipeline?.execution.completed} dateLabel={prevDate ? fmtDateShort(prevDate) : undefined} invert />
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-navy-800 text-[10px] text-navy-600">
              30-day standard starts here
            </div>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center justify-center gap-1 shrink-0 py-2">
            <ArrowRight className="h-5 w-5 text-navy-800 hidden md:block" />
          </div>

          {/* STEP 3: Meter Installation */}
          <div className="card-premium p-3 border border-emerald-500/30 flex-1 min-w-[140px]">
            <div className="text-[9px] font-medium text-navy-600 uppercase tracking-wider mb-1">Step 3</div>
            <div className="text-xs font-semibold text-emerald-400 mb-1">Meter Installation</div>
            <div className="text-[10px] text-navy-600">Final connection — then counted as Simple Connection</div>
            <div className="text-[10px] text-navy-600 mt-2">Included in 30 days</div>
          </div>
        </div>
      </div>

      {/* Section 2: Stage Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StageComparisonCard
          title="Estimates & Designs"
          outMetrics={dOut}
          compMetrics={dComp}
          prevOutMetrics={previousPipeline?.design.metrics.outstanding ?? null}
          prevCompMetrics={previousPipeline?.design.metrics.completed ?? null}
          slaTarget={12}
          color="#8b5cf6"
        />
        <StageComparisonCard
          title="Capital Works (Construction)"
          outMetrics={eOut}
          compMetrics={eComp}
          prevOutMetrics={previousPipeline?.execution.metrics.outstanding ?? null}
          prevCompMetrics={previousPipeline?.execution.metrics.completed ?? null}
          slaTarget={30}
          color="#f59e0b"
        />
      </div>

      {/* Section 3: Ageing Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dOut?.ageing_buckets && (
          <AgeingChart title="Estimates — Time Waiting" buckets={dOut.ageing_buckets} />
        )}
        {eOut?.ageing_buckets && (
          <AgeingChart title="Capital Works — Time Waiting" buckets={eOut.ageing_buckets} />
        )}
      </div>

      {/* Section 4: Outstanding Records */}
      <div className="card-premium p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-semibold text-white">Waiting Applications</h3>
          <div className="flex items-center gap-1 ml-auto text-xs">
            <button
              onClick={() => setRecordStage('design')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                recordStage === 'design'
                  ? 'bg-gold-500/20 text-gold-500'
                  : 'text-navy-600 hover:text-white hover:bg-navy-800/50'
              }`}
            >
              Estimates
            </button>
            <button
              onClick={() => setRecordStage('execution')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                recordStage === 'execution'
                  ? 'bg-gold-500/20 text-gold-500'
                  : 'text-navy-600 hover:text-white hover:bg-navy-800/50'
              }`}
            >
              Capital Works
            </button>
          </div>
        </div>

        {recordsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" className="border-amber-400" />
          </div>
        ) : records.length === 0 ? (
          <p className="text-center text-navy-600 py-4">No waiting applications.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Waiting applications">
              <thead>
                <tr className="border-b border-navy-800">
                  <th scope="col" className="text-left py-2 text-navy-600 font-medium text-xs">Account</th>
                  <th scope="col" className="text-left py-2 text-navy-600 font-medium text-xs">Customer</th>
                  <th scope="col" className="text-left py-2 text-navy-600 font-medium text-xs hidden md:table-cell">Location</th>
                  <th scope="col" className="text-right py-2 text-navy-600 font-medium text-xs">Days</th>
                  <th scope="col" className="text-right py-2 text-navy-600 font-medium text-xs">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 50).map((r) => {
                  const slaTarget = recordStage === 'design' ? 12 : 30;
                  const days = r.days_elapsed ?? r.days_elapsed_calculated ?? 0;
                  const status = days <= slaTarget ? 'within' : days <= slaTarget * 2 ? 'overdue' : 'severe';
                  return (
                    <tr key={r.id} className="border-b border-navy-800/50">
                      <td className="py-2 text-slate-400 font-mono text-xs">{r.account_number || '--'}</td>
                      <td className="py-2 text-white text-xs">{r.customer_name || '--'}</td>
                      <td className="py-2 text-slate-400 text-xs hidden md:table-cell">{r.town_city || '--'}</td>
                      <td className="py-2 text-right text-xs text-slate-400">{days}d</td>
                      <td className="py-2 text-right">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          status === 'within' ? 'bg-emerald-500/20 text-emerald-400'
                            : status === 'overdue' ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {status === 'within' ? 'Within standard' : status === 'overdue' ? 'Overdue' : 'Severely overdue'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

/** Compact delta shown below a number in the pipeline cards */
function InlineDelta({ current, previous, dateLabel, invert }: {
  current: number; previous: number | undefined; dateLabel?: string; invert?: boolean;
}) {
  if (previous === undefined) return null;
  const delta = current - previous;
  if (delta === 0) return null;
  // For "waiting" counts, going down is good. For "completed", going up is good (invert).
  const isGood = invert ? delta > 0 : delta < 0;
  return (
    <div className={`flex items-center justify-center gap-0.5 text-[9px] mt-0.5 ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
      {isGood ? <TrendingDown className="h-2.5 w-2.5" /> : <TrendingUp className="h-2.5 w-2.5" />}
      {delta > 0 ? '+' : ''}{delta}{dateLabel ? ` from ${dateLabel}` : ''}
    </div>
  );
}

function StageComparisonCard({ title, outMetrics, compMetrics, prevOutMetrics, prevCompMetrics, slaTarget, color }: {
  title: string;
  outMetrics: GPLMetricsRow | null;
  compMetrics: GPLMetricsRow | null;
  prevOutMetrics: GPLMetricsRow | null;
  prevCompMetrics: GPLMetricsRow | null;
  slaTarget: number;
  color: string;
}) {
  const hasPrev = prevOutMetrics !== null || prevCompMetrics !== null;
  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <h4 className="text-xs font-semibold text-white">{title}</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" aria-label={`${title} stage comparison`}>
          <thead>
            <tr className="border-b border-navy-800">
              <th scope="col" className="text-left py-1.5 text-navy-600">Metric</th>
              <th scope="col" className="text-right py-1.5 text-navy-600">Waiting</th>
              {hasPrev && <th scope="col" className="text-right py-1.5 text-navy-600 w-12">Δ</th>}
              <th scope="col" className="text-right py-1.5 text-navy-600">Completed</th>
              {hasPrev && <th scope="col" className="text-right py-1.5 text-navy-600 w-12">Δ</th>}
            </tr>
          </thead>
          <tbody>
            <MetricRow label="Count" out={outMetrics?.total_count} comp={compMetrics?.total_count} prevOut={prevOutMetrics?.total_count} prevComp={prevCompMetrics?.total_count} hasPrev={hasPrev} />
            <MetricRow label={`Within ${slaTarget}-day standard`} out={outMetrics?.sla_compliance_pct} comp={compMetrics?.sla_compliance_pct} prevOut={prevOutMetrics?.sla_compliance_pct} prevComp={prevCompMetrics?.sla_compliance_pct} suffix="%" hasPrev={hasPrev} invertDelta />
            <MetricRow label="Average" out={outMetrics?.mean_days} comp={compMetrics?.mean_days} prevOut={prevOutMetrics?.mean_days} prevComp={prevCompMetrics?.mean_days} suffix="d" hasPrev={hasPrev} />
            <MetricRow label="Typical time" out={outMetrics?.median_days} comp={compMetrics?.median_days} prevOut={prevOutMetrics?.median_days} prevComp={prevCompMetrics?.median_days} suffix="d" hasPrev={hasPrev} />
            <MetricRow label="90th percentile" out={outMetrics?.p90} comp={compMetrics?.p90} prevOut={prevOutMetrics?.p90} prevComp={prevCompMetrics?.p90} suffix="d" hasPrev={hasPrev} />
            <MetricRow label="Maximum" out={outMetrics?.max_days} comp={compMetrics?.max_days} prevOut={prevOutMetrics?.max_days} prevComp={prevCompMetrics?.max_days} suffix="d" hasPrev={hasPrev} slaTarget={slaTarget} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Format a delta value for the Δ column */
function DeltaCell({ current, previous, suffix = '', invertDelta }: {
  current: number | null | undefined;
  previous: number | null | undefined;
  suffix?: string;
  invertDelta?: boolean;
}) {
  if (current == null || previous == null) return <td className="py-1.5 text-right text-navy-600">--</td>;
  const delta = Math.round((current - previous) * 10) / 10;
  if (delta === 0) return <td className="py-1.5 text-right text-navy-600">—</td>;
  // For SLA % (invertDelta), going up is good. For days/counts, going down is good.
  const isGood = invertDelta ? delta > 0 : delta < 0;
  return (
    <td className={`py-1.5 text-right text-[10px] ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
      {delta > 0 ? '+' : ''}{delta}{suffix}
    </td>
  );
}

function MetricRow({ label, out, comp, prevOut, prevComp, suffix = '', hasPrev, invertDelta, slaTarget }: {
  label: string;
  out: number | null | undefined;
  comp: number | null | undefined;
  prevOut?: number | null | undefined;
  prevComp?: number | null | undefined;
  suffix?: string;
  hasPrev?: boolean;
  invertDelta?: boolean;
  slaTarget?: number;
}) {
  // Highlight extreme maximums (> 3x SLA target) in red
  const isMaxRow = slaTarget !== undefined;
  const outColor = isMaxRow && out != null && out > slaTarget * 3 ? 'text-red-400' : 'text-white';
  const compColor = isMaxRow && comp != null && comp > slaTarget * 3 ? 'text-red-400' : 'text-white';

  return (
    <tr className="border-b border-navy-800/30">
      <td className="py-1.5 text-slate-400">{label}</td>
      <td className={`py-1.5 text-right ${outColor}`}>{out != null ? `${out}${suffix}` : '--'}</td>
      {hasPrev && <DeltaCell current={out} previous={prevOut} suffix={suffix} invertDelta={invertDelta} />}
      <td className={`py-1.5 text-right ${compColor}`}>{comp != null ? `${comp}${suffix}` : '--'}</td>
      {hasPrev && <DeltaCell current={comp} previous={prevComp} suffix={suffix} invertDelta={invertDelta} />}
    </tr>
  );
}

function AgeingChart({ title, buckets }: { title: string; buckets: AgeingBucket[] }) {
  const data = buckets.map(b => ({ name: b.label, count: b.count, pct: b.pct }));
  return (
    <div className="card-premium p-4">
      <h4 className="text-xs font-semibold text-white mb-3">{title}</h4>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 0, right: 10 }}>
            <XAxis dataKey="name" tick={{ fill: CHART_THEME.colors.slate400, fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: CHART_THEME.colors.navy600, fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
            <Tooltip
              contentStyle={CHART_THEME.tooltip}
              formatter={(v: number, _n: string, props: { payload?: { pct: number } }) => [`${v} (${props.payload?.pct ?? 0}%)`, 'Count']}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={24}>
              {data.map((_, i) => (
                <Cell key={i} fill={AGEING_COLORS[i] || '#64748b'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
