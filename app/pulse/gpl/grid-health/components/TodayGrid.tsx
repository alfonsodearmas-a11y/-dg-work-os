'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, Zap } from 'lucide-react';
import Link from 'next/link';
import type { TodayOutage, TodayResponse, FeederGrade, TrendDirection } from '@/lib/gpl/types';
import { GPL_CONFIG } from '@/lib/gpl/config';

// ── Types ───────────────────────────────────────────────────────────────────

type DateRange = 'today' | 'yesterday' | 'week';
type ViewTab = 'timeline' | 'substation' | 'list';

interface TodayGridProps {
  onFeederSelect?: (feederId: number) => void;
  dateRange?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(time: string | null): string {
  if (!time) return '--:--';
  return time.slice(0, 5);
}

function formatDuration(minutes: number | null, isActive?: boolean, timeOut?: string | null): string {
  if (isActive && timeOut) {
    const now = new Date();
    const [h, m] = timeOut.split(':').map(Number);
    const outTime = new Date();
    outTime.setHours(h, m, 0, 0);
    const diffMs = now.getTime() - outTime.getTime();
    if (diffMs < 0) return 'ongoing';
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin >= 60) return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
    return `${diffMin}m`;
  }
  if (minutes == null) return 'ongoing';
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes} min`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatNumber(n: number | null): string {
  if (n == null) return '--';
  return n.toLocaleString();
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function gradeColor(grade: FeederGrade): string {
  return GPL_CONFIG.feederGrades[grade]?.color ?? '#64748b';
}

function causeColorClass(subcategory: string | null): string {
  if (!subcategory) return 'text-navy-600';
  const s = subcategory.toLowerCase();
  if (s.includes('earth fault')) return 'text-gold-500';
  if (s.includes('overcurrent')) return 'text-red-400';
  if (s.includes('planned') || s.includes('pm_')) return 'text-emerald-400';
  if (s.includes('generation')) return 'text-purple-400';
  return 'text-slate-400';
}

function trendArrow(trend: TrendDirection): string {
  if (trend === 'improving') return '\u2193';
  if (trend === 'worsening') return '\u2191';
  return '\u2192';
}

function trendColorClass(trend: TrendDirection): string {
  if (trend === 'improving') return 'text-emerald-400';
  if (trend === 'worsening') return 'text-red-400';
  return 'text-slate-400';
}

// ── Shared data hook ────────────────────────────────────────────────────────

function useTodayOutages(range: DateRange, dateRangeOverride?: string) {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fetchCount = useRef(0);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateRangeOverride) {
        if (dateRangeOverride.includes('/')) {
          const [from, to] = dateRangeOverride.split('/');
          params.set('from', from);
          params.set('to', to);
        } else {
          params.set('date', dateRangeOverride);
        }
      } else {
        params.set('range', range);
      }

      const res = await fetch(`/api/pulse/gpl/today?${params}`);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const json: TodayResponse = await res.json();
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [range, dateRangeOverride]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Auto-refresh: tick every 30s for running duration, re-fetch every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
      fetchCount.current += 1;
      if (fetchCount.current % 2 === 0) fetchData();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // tick forces re-render for running duration counters
  void tick;

  return { data, loading, error };
}

// ── Outage Card ─────────────────────────────────────────────────────────────

function OutageCard({
  outage,
  expanded,
  onToggle,
  onFeederSelect,
  showTime = false,
}: {
  outage: TodayOutage;
  expanded: boolean;
  onToggle: () => void;
  onFeederSelect?: (feederId: number) => void;
  showTime?: boolean;
}) {
  const isActive = outage.status === 'open';
  const health = outage.feeder_health;
  const isProblematic = health.grade === 'D' || health.grade === 'F';

  const cardBg = isActive
    ? 'bg-red-500/10 border-red-500/25'
    : 'bg-emerald-400/[0.08] border-emerald-400/15';

  return (
    <div
      className={`flex-1 rounded-[10px] px-3.5 py-2.5 cursor-pointer transition-all border ${cardBg}`}
      onClick={onToggle}
    >
      {/* Collapsed row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-red-500 animate-pulse-dot' : 'bg-emerald-400'}`}
          />
          <span className={`font-semibold text-[13px] truncate ${isActive ? 'text-red-300' : 'text-slate-200'}`}>
            {outage.feeder_name || outage.feeder_code}
          </span>
          <span className="text-xs text-navy-600 truncate">{outage.substation_name}</span>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {showTime && outage.time_out && (
            <span className="text-[11px] text-navy-600 font-mono">{formatTime(outage.time_out)}</span>
          )}
          <span className="text-xs font-semibold text-slate-200 font-mono">
            {formatDuration(outage.duration_minutes, isActive, outage.time_out)}
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
            isActive ? 'bg-red-500/20 text-red-400' : 'bg-emerald-400/15 text-emerald-400'
          }`}>
            {isActive ? 'active' : 'closed'}
          </span>
          <ChevronDown className={`w-4 h-4 text-navy-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 p-3 rounded-lg bg-black/20 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Time Out', value: formatTime(outage.time_out) },
              { label: 'Time In', value: outage.time_in ? formatTime(outage.time_in) : 'ongoing' },
              { label: 'Customers', value: formatNumber(outage.customers_affected) },
              { label: 'ENS (MWh)', value: outage.ens_mwh != null ? outage.ens_mwh.toFixed(3) : '--' },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-[10px] text-navy-600 uppercase tracking-wider">{label}</span>
                <span className="text-sm font-semibold text-slate-200 font-mono">{value}</span>
              </div>
            ))}
          </div>

          {/* Cause */}
          <div className="flex items-center gap-2 text-[13px]">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              causeColorClass(outage.cause_subcategory).replace('text-', 'bg-')
            }`} />
            <span className={`font-semibold ${causeColorClass(outage.cause_subcategory)}`}>
              {outage.cause_subcategory ?? 'Unknown'}
            </span>
            {outage.cause_detail && /\d+.*Amps/i.test(outage.cause_detail) && (
              <span className="text-slate-400 text-[11px] font-mono">{outage.cause_detail}</span>
            )}
          </div>

          {/* Area */}
          {(outage.areas_affected || outage.cause_detail) && (
            <div className="text-xs text-slate-400 leading-relaxed">
              {outage.areas_affected && <div>{outage.areas_affected}</div>}
              {outage.cause_detail && !/\d+.*Amps/i.test(outage.cause_detail) && (
                <div className="mt-0.5 text-navy-600">{outage.cause_detail}</div>
              )}
            </div>
          )}

          {/* Feeder intelligence */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className={isProblematic ? 'text-red-400' : 'text-slate-400'}>
              This feeder: {ordinal(health.outages_30d)} outage in 30 days
            </span>
            <button
              className="inline-flex items-center justify-center w-[22px] h-[22px] rounded text-[11px] font-bold cursor-pointer"
              style={{
                background: `${gradeColor(health.grade)}22`,
                color: gradeColor(health.grade),
                border: `1px solid ${gradeColor(health.grade)}44`,
              }}
              onClick={(e) => { e.stopPropagation(); onFeederSelect?.(outage.feeder_id); }}
              title={`Score: ${health.score}/100`}
            >
              {health.grade}
            </button>
            {isProblematic && (
              <span className={`text-[11px] font-semibold ${health.grade === 'F' ? 'text-red-400' : 'text-gold-500'}`}>
                Repeat offender
              </span>
            )}
            <span className={`${trendColorClass(health.trend)}`}>
              {trendArrow(health.trend)} {health.trend}
            </span>
            <span className="text-navy-600 text-[11px]">avg {health.avg_duration_30d}m restoration</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeline View ───────────────────────────────────────────────────────────

function TimelineView({
  outages, expandedId, onToggle, onFeederSelect,
}: {
  outages: TodayOutage[];
  expandedId: number | null;
  onToggle: (id: number) => void;
  onFeederSelect?: (feederId: number) => void;
}) {
  if (outages.length === 0) {
    return <div className="py-10 text-center text-sm text-navy-600">No outages recorded for this period</div>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {outages.map((o) => (
        <div key={o.id} className="flex">
          <div className="w-[60px] min-w-[60px] text-right pr-3 pt-3 text-[11px] text-navy-600 font-mono">
            {formatTime(o.time_out)}
          </div>
          <OutageCard
            outage={o}
            expanded={expandedId === o.id}
            onToggle={() => onToggle(o.id)}
            onFeederSelect={onFeederSelect}
          />
        </div>
      ))}
    </div>
  );
}

// ── By Substation View ──────────────────────────────────────────────────────

function SubstationView({
  outages, expandedId, onToggle, onFeederSelect,
}: {
  outages: TodayOutage[];
  expandedId: number | null;
  onToggle: (id: number) => void;
  onFeederSelect?: (feederId: number) => void;
}) {
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());

  const grouped = new Map<string, TodayOutage[]>();
  for (const o of outages) {
    const code = o.substation_code || 'UNKNOWN';
    const arr = grouped.get(code) ?? [];
    arr.push(o);
    grouped.set(code, arr);
  }

  const sorted = Array.from(grouped.entries()).sort((a, b) => b[1].length - a[1].length);

  if (sorted.length === 0) {
    return <div className="py-10 text-center text-sm text-navy-600">No outages recorded for this period</div>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {sorted.map(([subCode, subOutages]) => {
        const isOpen = openSubs.has(subCode);
        const activeCount = subOutages.filter((o) => o.status === 'open').length;
        const subName = subOutages[0]?.substation_name ?? subCode;

        return (
          <div key={subCode}>
            <button
              className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] cursor-pointer transition-all hover:bg-white/[0.05]"
              onClick={() => setOpenSubs((prev) => {
                const next = new Set(prev);
                if (next.has(subCode)) next.delete(subCode); else next.add(subCode);
                return next;
              })}
            >
              <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-200">
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                <span>{subName}</span>
                <span className="text-xs text-navy-600 font-normal">
                  {subOutages.length} outage{subOutages.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex gap-1.5">
                {activeCount > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-red-500/20 text-red-400">
                    {activeCount} active
                  </span>
                )}
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-400/10 text-slate-400">
                  {subOutages.length}
                </span>
              </div>
            </button>
            {isOpen && (
              <div className="pl-4 pt-1.5 flex flex-col gap-1.5">
                {subOutages.map((o) => (
                  <div key={o.id} className="flex">
                    <div className="w-[60px] min-w-[60px] text-right pr-3 pt-3 text-[11px] text-navy-600 font-mono">
                      {formatTime(o.time_out)}
                    </div>
                    <OutageCard
                      outage={o}
                      expanded={expandedId === o.id}
                      onToggle={() => onToggle(o.id)}
                      onFeederSelect={onFeederSelect}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── List View ───────────────────────────────────────────────────────────────

function ListView({
  outages, expandedId, onToggle, onFeederSelect,
}: {
  outages: TodayOutage[];
  expandedId: number | null;
  onToggle: (id: number) => void;
  onFeederSelect?: (feederId: number) => void;
}) {
  if (outages.length === 0) {
    return <div className="py-10 text-center text-sm text-navy-600">No outages recorded for this period</div>;
  }

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {['Time', 'Feeder', 'Duration', 'Customers', 'Cause', 'Status'].map((h) => (
            <th key={h} className="text-left px-2.5 py-2 text-navy-600 text-[10px] font-semibold uppercase tracking-wider border-b border-white/[0.06]">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {outages.map((o) => {
          const isActive = o.status === 'open';
          const isExpanded = expandedId === o.id;
          return (
            <tr key={o.id} className="cursor-pointer transition-colors hover:bg-white/[0.02]" onClick={() => onToggle(o.id)}>
              {isExpanded ? (
                <td className="px-2.5 py-2 border-b border-white/[0.03]" colSpan={6}>
                  <OutageCard outage={o} expanded onToggle={() => onToggle(o.id)} onFeederSelect={onFeederSelect} showTime />
                </td>
              ) : (
                <>
                  <td className="px-2.5 py-2 text-slate-200 border-b border-white/[0.03] font-mono">{formatTime(o.time_out)}</td>
                  <td className="px-2.5 py-2 text-slate-200 border-b border-white/[0.03]">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-red-500 animate-pulse-dot' : 'bg-emerald-400'}`} />
                      {o.feeder_code}
                    </div>
                  </td>
                  <td className="px-2.5 py-2 text-slate-200 border-b border-white/[0.03] font-mono">
                    {formatDuration(o.duration_minutes, isActive, o.time_out)}
                  </td>
                  <td className="px-2.5 py-2 text-slate-200 border-b border-white/[0.03]">{formatNumber(o.customers_affected)}</td>
                  <td className={`px-2.5 py-2 border-b border-white/[0.03] ${causeColorClass(o.cause_subcategory)}`}>
                    {o.cause_subcategory ?? '--'}
                  </td>
                  <td className="px-2.5 py-2 border-b border-white/[0.03]">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      isActive ? 'bg-red-500/20 text-red-400' : 'bg-emerald-400/15 text-emerald-400'
                    }`}>
                      {isActive ? 'active' : 'closed'}
                    </span>
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function TodayGrid({ onFeederSelect, dateRange: dateRangeOverride }: TodayGridProps) {
  const [range, setRange] = useState<DateRange>('today');
  const [viewTab, setViewTab] = useState<ViewTab>('timeline');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, loading, error } = useTodayOutages(range, dateRangeOverride);

  const toggleExpanded = (id: number) => setExpandedId((prev) => (prev === id ? null : id));

  if (loading && !data) {
    return <div className="py-10 text-center text-sm text-navy-600">Loading grid status...</div>;
  }

  if (error && !data) {
    return <div className="py-10 text-center text-sm text-red-400">Error: {error}</div>;
  }

  if (!data) return null;

  const { summary, outages, date } = data;

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-slate-200 m-0">Today&apos;s grid</h3>
          <span className="text-[13px] text-navy-600">{date.includes('to') ? date : formatDate(date)}</span>
        </div>

        <div className="flex gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
            summary.active > 0
              ? 'bg-red-500/15 text-red-400 border-red-500/30'
              : 'bg-slate-400/10 text-slate-400 border-slate-400/15'
          }`}>
            {summary.active > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse-dot" />}
            Active now {summary.active}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
            Restored {summary.restored}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-400/10 text-slate-400 border border-slate-400/15">
            Total {summary.total}
          </span>
        </div>

        {!dateRangeOverride && (
          <div className="flex gap-1 bg-white/[0.03] rounded-lg p-0.5">
            {(['yesterday', 'today', 'week'] as DateRange[]).map((r) => (
              <button
                key={r}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border-none cursor-pointer transition-all ${
                  range === r ? 'bg-gold-500/15 text-gold-500' : 'bg-transparent text-navy-600 hover:text-slate-400'
                }`}
                onClick={() => setRange(r)}
              >
                {r === 'yesterday' ? 'Yesterday' : r === 'today' ? 'Today' : 'This week'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* View tabs */}
      <div className="flex gap-0.5 border-b border-white/[0.06]">
        {(['timeline', 'substation', 'list'] as ViewTab[]).map((tab) => (
          <button
            key={tab}
            className={`px-4 py-2 text-xs font-medium border-none cursor-pointer bg-transparent transition-all border-b-2 ${
              viewTab === tab ? 'border-b-gold-500 text-slate-200' : 'border-b-transparent text-navy-600 hover:text-slate-400'
            }`}
            onClick={() => { setViewTab(tab); setExpandedId(null); }}
          >
            {tab === 'timeline' ? 'Timeline' : tab === 'substation' ? 'By substation' : 'List'}
          </button>
        ))}
      </div>

      {/* View content */}
      {viewTab === 'timeline' && (
        <TimelineView outages={outages} expandedId={expandedId} onToggle={toggleExpanded} onFeederSelect={onFeederSelect} />
      )}
      {viewTab === 'substation' && (
        <SubstationView outages={outages} expandedId={expandedId} onToggle={toggleExpanded} onFeederSelect={onFeederSelect} />
      )}
      {viewTab === 'list' && (
        <ListView outages={outages} expandedId={expandedId} onToggle={toggleExpanded} onFeederSelect={onFeederSelect} />
      )}
    </div>
  );
}

// ── Compact Grid Card (for main dashboard) ──────────────────────────────────

export function CompactGridCard() {
  const { data } = useTodayOutages('today');

  if (!data) {
    return (
      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <span className="text-[13px] text-navy-600">Loading grid status...</span>
      </div>
    );
  }

  const { summary, outages } = data;
  const recentEvents = outages.slice(0, 4);

  return (
    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-slate-200">GPL Grid</span>
        <div className="flex items-center gap-2 text-xs">
          <span className={`flex items-center gap-1 ${summary.active > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              summary.active > 0 ? 'bg-red-500 animate-pulse-dot' : 'bg-emerald-400'
            }`} />
            {summary.active} active
          </span>
          <span className="text-navy-600">|</span>
          <span className="text-slate-400">{summary.total} today</span>
        </div>
      </div>

      {/* Mini event list */}
      <div className="flex flex-col gap-1">
        {recentEvents.map((o) => (
          <div key={o.id} className="flex items-center gap-2 text-[11px] text-slate-400 py-0.5">
            <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${
              o.status === 'open' ? 'bg-red-500 animate-pulse-dot' : 'bg-emerald-400'
            }`} />
            <span className="flex-1 truncate">{o.feeder_code}</span>
            <span className="font-mono text-navy-600">{formatTime(o.time_out)}</span>
          </div>
        ))}
        {outages.length === 0 && (
          <div className="text-[11px] text-navy-600 py-1">No outages today</div>
        )}
      </div>

      <Link href="/pulse/gpl/grid-health" className="text-xs text-gold-500 no-underline font-medium hover:text-gold-400 transition-colors">
        View grid health &rarr;
      </Link>
    </div>
  );
}
