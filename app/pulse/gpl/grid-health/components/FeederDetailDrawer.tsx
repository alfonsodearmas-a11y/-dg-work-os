'use client';

import { useEffect, useState, useCallback } from 'react';
import { GPL_CONFIG, getGplCauseColor } from '@/lib/gpl/config';
import { fmtNumber } from '@/lib/format';
import type { FeederGrade } from '@/lib/gpl/types';

// ── Types ──────────────────────────────────────────────────────────────────

interface FeederDetail {
  feeder: {
    id: number;
    code: string;
    name: string;
    substation_code: string;
    substation_name: string;
    area_served: string | null;
    customer_count: number;
  };
  health: {
    grade: FeederGrade;
    score: number;
    outages_30d: number;
    avg_duration_min: number;
    total_downtime_min: number;
    trend: 'improving' | 'worsening' | 'stable';
  };
  stats: {
    mtbf_days: number | null;
    mttr_min: number;
    customer_minutes_30d: number;
    longest_outage: { duration_minutes: number; date: string } | null;
    total_outages_all_time: number;
  };
  outage_history: {
    id: number;
    date: string;
    time_out: string | null;
    time_in: string | null;
    duration_minutes: number | null;
    cause_subcategory: string | null;
    cause_detail: string | null;
    status: string;
  }[];
  cause_breakdown: {
    subcategory: string;
    count: number;
    pct: number;
  }[];
  monthly_trend: {
    month: string;
    count: number;
  }[];
}

interface FeederDetailDrawerProps {
  feederId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

// ── Grade lookups from config ─────────────────────────────────────────────

function gradeColor(grade: FeederGrade): string {
  return GPL_CONFIG.feederGrades[grade]?.color ?? '#64748b';
}

function gradeLabel(grade: FeederGrade): string {
  return GPL_CONFIG.feederGrades[grade].label;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatMonth(monthStr: string): string {
  const [, m] = monthStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[parseInt(m, 10) - 1] ?? m;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '--:--';
  return timeStr.slice(0, 5);
}

// ── Component ─────────────────────────────────────────────────────────────

export default function FeederDetailDrawer({ feederId, isOpen, onClose }: FeederDetailDrawerProps) {
  const [data, setData] = useState<FeederDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pulse/gpl/feeders/${id}`);
      if (!res.ok) throw new Error('Failed to load feeder data');
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && feederId != null) {
      fetchData(feederId);
    }
    if (!isOpen) {
      // Reset after close animation
      const t = setTimeout(() => setData(null), 250);
      return () => clearTimeout(t);
    }
  }, [isOpen, feederId, fetchData]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className={`slide-panel-backdrop transition-opacity duration-150 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 flex flex-col overflow-hidden w-full max-w-[400px] bg-navy-950 border-l border-gold-500/20 transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState message={error} onClose={onClose} />
        ) : data ? (
          <DrawerContent data={data} onClose={onClose} />
        ) : null}
      </div>
    </>
  );
}

// ── Drawer Content ────────────────────────────────────────────────────────

function DrawerContent({ data, onClose }: { data: FeederDetail; onClose: () => void }) {
  const { feeder, health, stats, outage_history, cause_breakdown, monthly_trend } = data;
  const gc = gradeColor(health.grade);

  return (
    <>
      {/* Header (sticky) */}
      <div className="flex items-start justify-between px-5 py-4 shrink-0 border-b border-white/[0.06]">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-white truncate text-base">
            {feeder.substation_code}/{feeder.code}
          </h2>
          <p className="text-xs mt-0.5 text-navy-600">
            {feeder.substation_name}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <span
            className="inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold"
            style={{
              backgroundColor: `${gc}20`,
              color: gc,
              border: `1px solid ${gc}40`,
            }}
          >
            {health.grade} — {gradeLabel(health.grade)}
          </span>
          <button
            onClick={onClose}
            className="text-navy-600 hover:text-white transition-colors p-1"
            aria-label="Close drawer"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l10 10M14 4L4 14" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <QuickStats stats={stats} health={health} />
        <Divider />
        <OutageTimeline outages={outage_history} />
        <Divider />
        <CauseBreakdown breakdown={cause_breakdown} />
        <Divider />
        <MonthlyTrend trend={monthly_trend} />
        <Divider />
        <AreaInfo feeder={feeder} />
      </div>
    </>
  );
}

// ── Quick Stats ───────────────────────────────────────────────────────────

function QuickStats({
  stats,
  health,
}: {
  stats: FeederDetail['stats'];
  health: FeederDetail['health'];
}) {
  return (
    <div>
      <SectionLabel>Quick Stats</SectionLabel>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <StatCard label="MTBF" value={stats.mtbf_days != null ? `${stats.mtbf_days} days` : 'N/A'} />
        <StatCard label="MTTR" value={`${stats.mttr_min} min`} />
        <StatCard
          label="Customer-min (30d)"
          value={fmtNumber(stats.customer_minutes_30d)}
        />
        <StatCard
          label="Longest outage"
          value={
            stats.longest_outage
              ? `${stats.longest_outage.duration_minutes} min`
              : 'N/A'
          }
          sub={stats.longest_outage ? formatDate(stats.longest_outage.date) : undefined}
        />
      </div>
      <p className="text-xs mt-2 text-navy-600">
        Total all-time: {stats.total_outages_all_time} outages
        {health.trend !== 'stable' && (
          <span
            className={`ml-2 ${health.trend === 'improving' ? 'text-emerald-600' : 'text-red-500'}`}
          >
            {health.trend === 'improving' ? '↓ Improving' : '↑ Worsening'}
          </span>
        )}
      </p>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg px-3 py-2 bg-navy-950">
      <p className="text-[10px] uppercase tracking-wider text-navy-600">
        {label}
      </p>
      <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
      {sub && (
        <p className="text-[10px] text-navy-600">
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Outage Timeline ───────────────────────────────────────────────────────

function OutageTimeline({ outages }: { outages: FeederDetail['outage_history'] }) {
  return (
    <div>
      <SectionLabel>Outage Timeline (90d)</SectionLabel>
      {outages.length === 0 ? (
        <p className="text-xs mt-2 text-navy-600">
          No outages in the last 90 days.
        </p>
      ) : (
        <div className="mt-2 space-y-0 overflow-y-auto pr-1 max-h-[300px]">
          {outages.map((o, i) => (
            <div
              key={o.id}
              className={`flex items-start gap-3 py-2 relative ${
                i < outages.length - 1 ? 'border-b border-white/[0.04]' : ''
              }`}
            >
              {/* Timeline dot + line */}
              <div className="relative flex flex-col items-center shrink-0 w-3">
                <div
                  className={`rounded-full shrink-0 w-2 h-2 mt-1 ${
                    o.status === 'closed' ? 'bg-emerald-600' : 'bg-red-500'
                  }`}
                />
                {i < outages.length - 1 && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 w-px bg-white/[0.08]" style={{ height: 'calc(100% + 8px)' }} />
                )}
              </div>

              {/* Date */}
              <div className="shrink-0 w-12">
                <p className="text-[11px] font-medium text-white">{formatDate(o.date)}</p>
              </div>

              {/* Time range */}
              <div className="shrink-0">
                <p className="text-[11px] text-slate-400">
                  {formatTime(o.time_out)} – {formatTime(o.time_in)}
                </p>
              </div>

              {/* Duration + cause */}
              <div className="flex-1 min-w-0 text-right">
                <span className="text-[11px] font-medium text-white">
                  {o.duration_minutes != null ? `${o.duration_minutes}m` : '—'}
                </span>
                {o.cause_subcategory && (
                  <span
                    className="ml-1.5 inline-block text-[10px] rounded px-1.5 py-0.5"
                    style={{
                      backgroundColor: `${getGplCauseColor(o.cause_subcategory)}20`,
                      color: getGplCauseColor(o.cause_subcategory),
                    }}
                  >
                    {o.cause_subcategory}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cause Breakdown ───────────────────────────────────────────────────────

function CauseBreakdown({ breakdown }: { breakdown: FeederDetail['cause_breakdown'] }) {
  if (breakdown.length === 0) {
    return (
      <div>
        <SectionLabel>Cause Breakdown</SectionLabel>
        <p className="text-xs mt-2 text-navy-600">No data.</p>
      </div>
    );
  }

  // Single cause — text summary only
  if (breakdown.length === 1) {
    const c = breakdown[0];
    return (
      <div>
        <SectionLabel>Cause Breakdown</SectionLabel>
        <p className="text-xs mt-2 text-white">
          All outages: <span style={{ color: getGplCauseColor(c.subcategory) }}>{c.subcategory}</span>{' '}
          ({c.count} total)
        </p>
      </div>
    );
  }

  // Build conic-gradient segments
  let accPct = 0;
  const gradientStops: string[] = [];
  for (const c of breakdown) {
    const color = getGplCauseColor(c.subcategory);
    gradientStops.push(`${color} ${accPct}%`);
    accPct += c.pct;
    gradientStops.push(`${color} ${accPct}%`);
  }
  // Fill remainder if rounding causes gap
  if (accPct < 100) {
    const lastColor = getGplCauseColor(breakdown[breakdown.length - 1].subcategory);
    gradientStops.push(`${lastColor} ${accPct}%`);
    gradientStops.push(`${lastColor} 100%`);
  }

  return (
    <div>
      <SectionLabel>Cause Breakdown</SectionLabel>
      <div className="flex items-start gap-4 mt-3">
        {/* Donut */}
        <div
          className="shrink-0 rounded-full w-[72px] h-[72px]"
          style={{
            background: `conic-gradient(${gradientStops.join(', ')})`,
            mask: 'radial-gradient(circle at center, transparent 55%, black 56%)',
            WebkitMask: 'radial-gradient(circle at center, transparent 55%, black 56%)',
          }}
        />
        {/* Legend */}
        <div className="space-y-1.5 flex-1 min-w-0">
          {breakdown.map((c) => (
            <div key={c.subcategory} className="flex items-center gap-2 text-[11px]">
              <div
                className="shrink-0 rounded-sm w-2 h-2"
                style={{ backgroundColor: getGplCauseColor(c.subcategory) }}
              />
              <span className="text-white truncate">{c.subcategory}</span>
              <span className="ml-auto shrink-0 text-navy-600">
                {c.count} ({c.pct}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Monthly Trend ─────────────────────────────────────────────────────────

function MonthlyTrend({ trend }: { trend: FeederDetail['monthly_trend'] }) {
  if (trend.length === 0) {
    return (
      <div>
        <SectionLabel>Monthly Trend</SectionLabel>
        <p className="text-xs mt-2 text-navy-600">No data.</p>
      </div>
    );
  }

  // Show last 6 months max
  const visible = trend.slice(-6);
  const maxCount = Math.max(...visible.map((t) => t.count), 1);
  const barMaxH = 80;
  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <div>
      <SectionLabel>Monthly Trend</SectionLabel>
      <div className="mt-3">
        <svg
          width="100%"
          viewBox={`0 0 ${visible.length * 48} ${barMaxH + 32}`}
          className="overflow-visible"
        >
          {visible.map((t, i) => {
            const barH = Math.max((t.count / maxCount) * barMaxH, 4);
            const x = i * 48 + 8;
            const barW = 28;
            const y = barMaxH - barH;
            const isCurrent = t.month === currentMonth;
            const fill = isCurrent ? '#d4af37' : '#2d6a6a';

            return (
              <g key={t.month}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={3}
                  fill={fill}
                />
                {/* Count label above bar */}
                <text
                  x={x + barW / 2}
                  y={y - 4}
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px]"
                >
                  {t.count}
                </text>
                {/* Month label below */}
                <text
                  x={x + barW / 2}
                  y={barMaxH + 14}
                  textAnchor="middle"
                  className="fill-navy-600 text-[10px]"
                >
                  {formatMonth(t.month)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ── Area Info ─────────────────────────────────────────────────────────────

function AreaInfo({ feeder }: { feeder: FeederDetail['feeder'] }) {
  return (
    <div>
      <SectionLabel>Area Info</SectionLabel>
      <div className="space-y-1.5 mt-2 text-xs">
        <InfoRow label="Area served" value={feeder.area_served ?? 'Unknown'} />
        <InfoRow label="Customers" value={fmtNumber(feeder.customer_count)} />
        <InfoRow label="Substation" value={feeder.substation_name} />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-navy-600">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] uppercase tracking-wider font-semibold text-gold-500">
      {children}
    </h3>
  );
}

function Divider() {
  return <div className="h-px bg-white/[0.06]" />;
}

// ── Loading Skeleton ──────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="p-5 space-y-4 animate-pulse">
      <div className="flex justify-between items-start">
        <div>
          <div className="h-4 w-32 rounded bg-navy-900" />
          <div className="h-3 w-20 rounded mt-2 bg-navy-900" />
        </div>
        <div className="h-6 w-16 rounded-full bg-navy-900" />
      </div>
      <div className="h-px bg-white/[0.06]" />
      <div className="grid grid-cols-2 gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg p-3 bg-navy-950">
            <div className="h-2 w-12 rounded bg-navy-900" />
            <div className="h-4 w-16 rounded mt-2 bg-navy-900" />
          </div>
        ))}
      </div>
      <div className="h-px bg-white/[0.06]" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-2 w-2 rounded-full mt-1 bg-navy-900" />
          <div className="h-3 flex-1 rounded bg-navy-900" />
        </div>
      ))}
    </div>
  );
}

// ── Error State ───────────────────────────────────────────────────────────

function ErrorState({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
      <div className="text-3xl mb-3 text-red-500">!</div>
      <p className="text-sm text-white mb-1">Failed to load feeder</p>
      <p className="text-xs mb-4 text-navy-600">{message}</p>
      <button
        onClick={onClose}
        className="text-xs px-3 py-1.5 rounded bg-navy-900 text-slate-400 hover:text-white transition-colors"
      >
        Close
      </button>
    </div>
  );
}
