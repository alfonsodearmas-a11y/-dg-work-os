'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { GPL_CAUSE_COLORS, GPL_CAUSE_COLOR_DEFAULT } from '@/lib/gpl/config';

// ── Types ───────────────────────────────────────────────────────────────────

interface SubstationBreakdown {
  code: string;
  name: string;
  count: number;
}

interface CauseBreakdown {
  subcategory: string;
  count: number;
  pct: number;
}

interface WorstFeeder {
  feeder_code: string;
  substation_code: string;
  display: string;
  count: number;
  customer_count: number;
}

interface MonthData {
  month: string;
  label: string;
  outage_count: number;
  avg_duration_minutes: number;
  total_ens_mwh: number;
  total_customers_affected: number;
  has_long_outage: boolean;
  is_current: boolean;
  vs_previous: {
    outage_count_delta_pct: number;
    avg_duration_delta_pct: number;
    ens_delta_pct: number;
  } | null;
  by_substation: SubstationBreakdown[];
  by_cause: CauseBreakdown[];
  worst_feeders: WorstFeeder[];
}

interface MonthlyPerformanceProps {
  onFeederSelect?: (feederId: string) => void;
  onNavigateToday?: (dateRange: { from: string; to: string }) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function DeltaArrow({ value }: { value: number }) {
  if (value === 0) return <span className="text-navy-600 text-[11px]">--</span>;
  const improving = value < 0;
  return (
    <span className={`text-[11px] font-semibold ${improving ? 'text-emerald-600' : 'text-red-500'}`}>
      {improving ? '\u2193' : '\u2191'} {Math.abs(value)}%
    </span>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Component ───────────────────────────────────────────────────────────────

export default function MonthlyPerformance({
  onFeederSelect,
  onNavigateToday,
}: MonthlyPerformanceProps) {
  const [months, setMonths] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/pulse/gpl/monthly');
        if (!res.ok) throw new Error('Failed to load monthly data');
        const data = await res.json();
        setMonths(data.months ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const maxOutageCount = useMemo(
    () => Math.max(...months.map((m) => m.outage_count), 1),
    [months],
  );

  const expandedData = months.find((m) => m.month === expandedMonth);

  function toggleMonth(month: string) {
    setExpandedMonth((prev) => (prev === month ? null : month));
  }

  // Scroll detail panel into view after expand
  useEffect(() => {
    if (expandedMonth && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [expandedMonth]);

  if (loading) {
    return (
      <div className="card-premium p-8">
        <div className="flex items-center justify-center gap-3 text-navy-600">
          <Spinner size="sm" />
          Loading monthly performance...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-500/[0.08] border border-red-500/30 rounded-xl text-red-400 text-[13px]">
        {error}
      </div>
    );
  }

  if (months.length === 0) {
    return (
      <div className="p-8 text-center text-navy-600 text-[13px]">
        No outage data available for the selected period.
      </div>
    );
  }

  return (
    <div>
      {/* ── Month Card Grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {months.map((m) => {
          const isExpanded = expandedMonth === m.month;
          const barIntensity = m.outage_count / maxOutageCount;
          const barColor =
            barIntensity > 0.7
              ? '#dc2626'
              : barIntensity > 0.4
                ? '#d4af37'
                : '#059669';

          return (
            <button
              key={m.month}
              onClick={() => toggleMonth(m.month)}
              className={`relative overflow-hidden rounded-xl px-3.5 pt-3.5 pb-2 cursor-pointer text-center transition-all duration-200 flex flex-col items-center gap-0.5 w-full border ${
                m.is_current
                  ? 'border-gold-500/50'
                  : isExpanded
                    ? 'border-gold-500/30'
                    : 'border-navy-800'
              } ${
                isExpanded
                  ? 'bg-gradient-to-br from-navy-900 to-[#1f3055]'
                  : 'bg-navy-950'
              }`}
            >
              {m.has_long_outage && (
                <span className="absolute top-2 right-2 w-[7px] h-[7px] rounded-full bg-red-500 shadow-[0_0_6px_rgba(220,38,38,0.5)]" />
              )}

              <span className="text-[11px] text-navy-600 tracking-wide">
                {m.label}
                {m.is_current && (
                  <span className="text-gold-500 ml-1 text-[9px]">(in progress)</span>
                )}
              </span>

              <span className="text-2xl font-bold text-slate-100 leading-tight tabular-nums">
                {m.outage_count}
              </span>
              <span className="text-[10px] text-navy-600 uppercase tracking-widest">
                outages
              </span>

              <div className="mt-0.5 min-h-[16px]">
                {m.vs_previous ? (
                  <DeltaArrow value={m.vs_previous.outage_count_delta_pct} />
                ) : (
                  <span className="text-[11px] text-navy-600">--</span>
                )}
              </div>

              <div className="flex justify-between w-full mt-1 pt-1.5 border-t border-navy-800/50">
                <span className="text-[11px] text-slate-400">
                  {m.avg_duration_minutes}m avg
                </span>
                <span className="text-[11px] text-slate-400">
                  {m.total_ens_mwh.toFixed(1)} MWh
                </span>
              </div>

              <div
                className="absolute bottom-0 left-0 right-0 h-[3px]"
                style={{
                  background: barColor,
                  opacity: 0.3 + barIntensity * 0.7,
                }}
              />
            </button>
          );
        })}
      </div>

      {/* ── Detail Panel ────────────────────────────────────────────────── */}
      <div
        ref={detailRef}
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: expandedData ? 600 : 0 }}
      >
        {expandedData && (
          <div className="mt-4 card-premium p-5 border-t-2 border-t-gold-500/40">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h4 className="text-[11px] text-navy-600 uppercase tracking-widest mb-2.5 font-semibold">
                  By Substation
                </h4>
                <div className="flex flex-col gap-1.5">
                  {expandedData.by_substation.slice(0, 8).map((sub, idx) => {
                    const maxCount = expandedData.by_substation[0]?.count ?? 1;
                    const barWidth = Math.round((sub.count / maxCount) * 60);
                    const subBarColor =
                      idx === 0 ? '#dc2626' : idx === 1 ? '#d4af37' : '#5DCAA5';

                    return (
                      <button
                        key={sub.code}
                        onClick={() => onFeederSelect?.(sub.code)}
                        className="flex items-center gap-2 bg-transparent border-none cursor-pointer py-0.5 w-full text-left"
                      >
                        <span className="flex-1 text-xs text-slate-200 truncate min-w-0">
                          {sub.name}
                        </span>
                        <span className="text-xs text-slate-400 font-mono min-w-[20px] text-right">
                          {sub.count}
                        </span>
                        <div className="w-[60px] h-1.5 bg-navy-900 rounded-full overflow-hidden shrink-0">
                          <div
                            className="h-full rounded-full opacity-80"
                            style={{ width: barWidth, background: subBarColor }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-5">
                <div>
                  <h4 className="text-[11px] text-navy-600 uppercase tracking-widest mb-2.5 font-semibold">
                    By Cause
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {expandedData.by_cause.slice(0, 5).map((c) => (
                      <div
                        key={c.subcategory}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            background:
                              GPL_CAUSE_COLORS[c.subcategory] ?? GPL_CAUSE_COLOR_DEFAULT,
                          }}
                        />
                        <span className="flex-1 text-slate-200 truncate">
                          {c.subcategory}
                        </span>
                        <span className="text-slate-400 font-mono">
                          {c.count}
                        </span>
                        <span className="text-navy-600 text-[11px] min-w-[30px]">
                          {c.pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {expandedData.vs_previous && (
                  <div>
                    <h4 className="text-[11px] text-navy-600 uppercase tracking-widest mb-2.5 font-semibold">
                      vs Previous Month
                    </h4>
                    <div className="flex flex-col gap-1.5">
                      <ComparisonRow
                        label="Outages"
                        delta={expandedData.vs_previous.outage_count_delta_pct}
                      />
                      <ComparisonRow
                        label="Avg Restoration"
                        delta={expandedData.vs_previous.avg_duration_delta_pct}
                      />
                      <ComparisonRow
                        label="Energy Not Supplied"
                        delta={expandedData.vs_previous.ens_delta_pct}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {expandedData.worst_feeders.length > 0 && (
              <div className="mt-4">
                <h4 className="text-[11px] text-navy-600 uppercase tracking-widest mb-2 font-semibold">
                  Repeat Offenders
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {expandedData.worst_feeders.map((f) => (
                    <button
                      key={f.feeder_code}
                      onClick={() => onFeederSelect?.(f.feeder_code)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full cursor-pointer text-[11px] text-slate-200 transition-opacity border ${
                        f.count >= 3
                          ? 'bg-red-500/20 border-red-500/40'
                          : f.count >= 2
                            ? 'bg-gold-500/15 border-gold-500/30'
                            : 'bg-navy-800/50 border-navy-800'
                      }`}
                    >
                      <span className="font-semibold">{f.display}</span>
                      <span className="font-mono text-slate-400">
                        {f.count}x
                      </span>
                      <span className="text-navy-600 text-[10px]">
                        {formatNumber(f.customer_count)} cust
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-navy-800/50 text-right">
              <button
                onClick={() => {
                  const [y, mNum] = expandedData.month.split('-').map(Number);
                  const lastDay = new Date(y, mNum, 0).getDate();
                  onNavigateToday?.({
                    from: `${expandedData.month}-01`,
                    to: `${expandedData.month}-${String(lastDay).padStart(2, '0')}`,
                  });
                }}
                className="bg-transparent border-none cursor-pointer text-gold-500 text-xs font-medium p-0 hover:text-gold-400 transition-colors"
              >
                View all {expandedData.outage_count} outages for{' '}
                {expandedData.label} &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ComparisonRow({ label, delta }: { label: string; delta: number }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-slate-400">{label}</span>
      <DeltaArrow value={delta} />
    </div>
  );
}
