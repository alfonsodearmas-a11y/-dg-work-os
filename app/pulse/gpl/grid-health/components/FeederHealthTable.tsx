'use client';

import { useState, useEffect, useMemo } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { fmtNumber } from '@/lib/format';
import type { FeederGrade, TrendDirection } from '@/lib/gpl/types';

// ── Types ──────────────────────────────────────────────────────────────────────

interface FeederHealthData {
  grade: FeederGrade;
  score: number;
  outages_30d: number;
  avg_duration_min: number;
  total_downtime_min: number;
  top_cause: string | null;
  trend: TrendDirection;
  last_outage_date: string | null;
  last_outage_time: string | null;
}

interface FeederRow {
  feeder_id: number;
  feeder_code: string;
  feeder_name: string;
  substation_code: string;
  substation_name: string;
  area_served: string | null;
  customer_count: number;
  health: FeederHealthData;
}

interface FeedersResponse {
  feeders: FeederRow[];
  summary: {
    total_feeders: number;
    feeders_with_outages: number;
    grade_distribution: Record<FeederGrade, number>;
  };
}

type SortOption = 'grade_asc' | 'grade_desc' | 'outages' | 'customers';

interface FeederHealthTableProps {
  onFeederSelect?: (feederId: number) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const GRADE_STYLES: Record<FeederGrade, { bg: string; text: string }> = {
  A: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  B: { bg: 'bg-teal-500/20', text: 'text-teal-400' },
  C: { bg: 'bg-amber-500/15', text: 'text-amber-300' },
  D: { bg: 'bg-amber-600/20', text: 'text-amber-400' },
  F: { bg: 'bg-red-500/20', text: 'text-red-400' },
};

const ALL_GRADES: FeederGrade[] = ['A', 'B', 'C', 'D', 'F'];
const GRADE_ORDER: FeederGrade[] = ['F', 'D', 'C', 'B', 'A'];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'grade_asc', label: 'Worst first' },
  { value: 'grade_desc', label: 'Best first' },
  { value: 'outages', label: 'Most outages' },
  { value: 'customers', label: 'Most customers' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDowntime(minutes: number): string {
  if (minutes === 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function TrendArrow({ trend }: { trend: TrendDirection }) {
  if (trend === 'worsening') {
    return (
      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
    );
  }
  if (trend === 'improving') {
    return (
      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    );
  }
  return <span className="text-navy-600">—</span>;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function FeederHealthTable({ onFeederSelect }: FeederHealthTableProps) {
  const [data, setData] = useState<FeedersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [substationFilter, setSubstationFilter] = useState('');
  const [activeGrades, setActiveGrades] = useState<Set<FeederGrade>>(new Set(ALL_GRADES));
  const [sort, setSort] = useState<SortOption>('grade_asc');

  // Fetch all feeders once on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/pulse/gpl/feeders');
        if (!res.ok) throw new Error(`Failed to load feeders (${res.status})`);
        const json: FeedersResponse = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load feeder data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Derive substations from full dataset
  const substations = useMemo(
    () => (data ? Array.from(new Set(data.feeders.map((f) => f.substation_code))).sort() : []),
    [data]
  );

  // Filter and sort client-side
  const feeders = useMemo(() => {
    if (!data) return [];
    let result = data.feeders;

    if (substationFilter) {
      result = result.filter(
        (f) => f.substation_code.toUpperCase() === substationFilter.toUpperCase()
      );
    }

    if (activeGrades.size < ALL_GRADES.length) {
      result = result.filter((f) => activeGrades.has(f.health.grade));
    }

    result = [...result];
    switch (sort) {
      case 'grade_asc':
        result.sort(
          (a, b) =>
            GRADE_ORDER.indexOf(a.health.grade) - GRADE_ORDER.indexOf(b.health.grade) ||
            a.health.score - b.health.score
        );
        break;
      case 'grade_desc':
        result.sort(
          (a, b) =>
            GRADE_ORDER.indexOf(b.health.grade) - GRADE_ORDER.indexOf(a.health.grade) ||
            b.health.score - a.health.score
        );
        break;
      case 'outages':
        result.sort((a, b) => b.health.outages_30d - a.health.outages_30d);
        break;
      case 'customers':
        result.sort((a, b) => b.customer_count - a.customer_count);
        break;
    }

    return result;
  }, [data, substationFilter, activeGrades, sort]);

  function toggleGrade(grade: FeederGrade) {
    setActiveGrades((prev) => {
      const next = new Set(prev);
      if (next.has(grade)) {
        if (next.size === 1) return prev;
        next.delete(grade);
      } else {
        next.add(grade);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="card-premium p-8">
        <div className="flex items-center justify-center gap-3 text-navy-600">
          <Spinner size="sm" />
          Loading feeder health data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-premium p-8">
        <p className="text-red-400 text-center">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card-premium p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="sub-filter" className="text-xs uppercase tracking-wider text-navy-600">
              Substation
            </label>
            <select
              id="sub-filter"
              value={substationFilter}
              onChange={(e) => setSubstationFilter(e.target.value)}
              className="bg-navy-900 border border-navy-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-gold-500/50"
            >
              <option value="">All</option>
              {substations.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-navy-600">Grade</span>
            <div className="flex gap-1">
              {ALL_GRADES.map((grade) => {
                const active = activeGrades.has(grade);
                const style = GRADE_STYLES[grade];
                return (
                  <button
                    key={grade}
                    onClick={() => toggleGrade(grade)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      active
                        ? `${style.bg} ${style.text} ring-1 ring-current/30`
                        : 'bg-navy-900 text-navy-600 opacity-50'
                    }`}
                  >
                    {grade}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs uppercase tracking-wider text-navy-600">Sort</span>
            <div className="flex gap-1">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSort(opt.value)}
                  className={`px-3 py-1.5 rounded-md text-xs transition-all ${
                    sort === opt.value
                      ? 'bg-gold-500/15 text-gold-500 ring-1 ring-gold-500/30'
                      : 'bg-navy-900 text-navy-600 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card-premium overflow-hidden">
        {feeders.length === 0 ? (
          <div className="p-12 text-center text-navy-600">
            No feeders match the selected filters
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-navy-800">
                  <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wider text-navy-600 font-medium w-[60px]">Grade</th>
                  <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wider text-navy-600 font-medium w-[140px]">Feeder</th>
                  <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wider text-navy-600 font-medium">Area served</th>
                  <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wider text-navy-600 font-medium w-[80px]">Customers</th>
                  <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wider text-navy-600 font-medium w-[80px]">Outages</th>
                  <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wider text-navy-600 font-medium w-[80px]">Avg dur.</th>
                  <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wider text-navy-600 font-medium w-[90px]">Downtime</th>
                  <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wider text-navy-600 font-medium w-[120px]">Top cause</th>
                  <th className="px-3 py-3 text-center text-[11px] uppercase tracking-wider text-navy-600 font-medium w-[60px]">Trend</th>
                </tr>
              </thead>
              <tbody>
                {feeders.map((feeder) => {
                  const g = GRADE_STYLES[feeder.health.grade];
                  const outageColor =
                    feeder.health.outages_30d >= 3
                      ? 'text-red-400'
                      : feeder.health.outages_30d === 2
                        ? 'text-amber-400'
                        : 'text-white';

                  return (
                    <tr
                      key={feeder.feeder_id}
                      onClick={() => onFeederSelect?.(feeder.feeder_id)}
                      className="border-b border-navy-800/50 cursor-pointer hover:bg-gold-500/[0.06] transition-colors"
                    >
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center justify-center w-8 h-6 rounded-md text-xs font-bold ${g.bg} ${g.text}`}>
                          {feeder.health.grade}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <span className="text-sm font-semibold text-white">
                          {feeder.substation_code}/{feeder.feeder_code}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <span className="text-sm text-navy-600 truncate block max-w-[200px]" title={feeder.area_served ?? ''}>
                          {feeder.area_served ?? '—'}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-right">
                        <span className="text-sm text-white tabular-nums">
                          {fmtNumber(feeder.customer_count)}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-right">
                        <span className={`text-sm font-medium tabular-nums ${outageColor}`}>
                          {feeder.health.outages_30d}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-right">
                        <span className="text-sm text-white tabular-nums">
                          {feeder.health.avg_duration_min} min
                        </span>
                      </td>

                      <td className="px-3 py-3 text-right">
                        <span className="text-sm text-white tabular-nums">
                          {formatDowntime(feeder.health.total_downtime_min)}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <span className="text-sm text-navy-600 truncate block max-w-[120px]" title={feeder.health.top_cause ?? ''}>
                          {feeder.health.top_cause ?? '—'}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex justify-center">
                          <TrendArrow trend={feeder.health.trend} />
                        </div>
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
