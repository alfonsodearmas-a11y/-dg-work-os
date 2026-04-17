'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Package } from 'lucide-react';
import {
  TENDER_STAGES,
  STAGE_CONFIG,
  METHOD_CONFIG,
  type Tender,
  type TenderStage,
  type TenderMethod,
  type PipelineStats,
} from '@/lib/tender/types';
import { AgencyBadge } from './AgencyBadge';
import { DaysAtStageIndicator } from './DaysAtStageIndicator';

interface Filters {
  agencies: string[];
  methods: TenderMethod[];
  stages: TenderStage[];
}

interface AwardedSincePayload {
  previous_upload_at: string | null;
  count: number;
}

export function ProcurementAnalytics() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [awardedSince, setAwardedSince] = useState<AwardedSincePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({ agencies: [], methods: [], stages: [] });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/procurement');
      if (!res.ok) return;
      const data = await res.json();
      setTenders(data.tenders || []);
      setStats(data.stats || null);
      setAwardedSince(data.awarded_since || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const { agencies, methods, stages } = filters;
    if (agencies.length === 0 && methods.length === 0 && stages.length === 0) return tenders;
    return tenders.filter(
      (t) =>
        (agencies.length === 0 || agencies.includes(t.agency.toUpperCase())) &&
        (methods.length === 0 || (t.method ? methods.includes(t.method) : false)) &&
        (stages.length === 0 || stages.includes(t.stage)),
    );
  }, [tenders, filters]);

  const availableAgencies = useMemo(() => {
    const set = new Set<string>();
    tenders.forEach((t) => set.add(t.agency.toUpperCase()));
    return Array.from(set).sort();
  }, [tenders]);

  const toggleAgency = (a: string) =>
    setFilters((f) => ({ ...f, agencies: f.agencies.includes(a) ? f.agencies.filter((x) => x !== a) : [...f.agencies, a] }));

  // Count-based aggregations.
  const byStage = useMemo(() => {
    const counts = Object.fromEntries(TENDER_STAGES.map((s) => [s, 0])) as Record<TenderStage, number>;
    for (const t of filtered) counts[t.stage]++;
    return counts;
  }, [filtered]);

  const byAgency = useMemo(() => {
    const m: Record<string, { active: number; award: number; stalled: number }> = {};
    for (const t of filtered) {
      if (!m[t.agency]) m[t.agency] = { active: 0, award: 0, stalled: 0 };
      if (t.stage === 'award') m[t.agency].award++;
      else m[t.agency].active++;
      if (t.stage !== 'award' && t.days_at_current_stage >= 30) m[t.agency].stalled++;
    }
    return Object.entries(m).sort((a, b) => b[1].active - a[1].active);
  }, [filtered]);

  const byMethod = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of filtered) {
      const label = t.method ? METHOD_CONFIG[t.method].label : '(no method)';
      m[label] = (m[label] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const flagCounts = useMemo(() => {
    let rollover = 0, exception = 0, inferred = 0, inheritedAwarded = 0;
    for (const t of filtered) {
      if (t.is_rollover) rollover++;
      if (t.has_exception) exception++;
      if (t.stage_source === 'inferred_from_dates') inferred++;
      if (t.first_appearance_already_awarded) inheritedAwarded++;
    }
    return { rollover, exception, inferred, inheritedAwarded };
  }, [filtered]);

  const stalled = useMemo(() => {
    return filtered
      .filter((t) => t.stage !== 'award' && t.days_at_current_stage >= 30)
      .sort((a, b) => b.days_at_current_stage - a.days_at_current_stage)
      .slice(0, 10);
  }, [filtered]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-56 bg-navy-900 rounded-xl border border-navy-800 animate-pulse" />)}
      </div>
    );
  }

  if (tenders.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-navy-800 flex items-center justify-center mx-auto mb-4">
            <Package className="w-7 h-7 text-navy-600" />
          </div>
          <p className="text-navy-600 text-sm">No procurement data available.</p>
        </div>
      </div>
    );
  }

  const total = filtered.length || 1;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {availableAgencies.map((a) => {
          const active = filters.agencies.includes(a);
          return (
            <button
              key={a}
              onClick={() => toggleAgency(a)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                active ? 'bg-gold-500/20 text-gold-500 border-gold-500/30' : 'bg-navy-900 text-navy-600 border-navy-800 hover:text-white hover:border-navy-700'
              }`}
            >
              {a === 'HINTERLAND_AIRSTRIPS' ? 'Airstrips' : a}
            </button>
          );
        })}
      </div>

      {/* KPIs (counts only — no dollar totals) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-navy-900 rounded-xl border border-navy-800 p-3">
          <div className="text-navy-600 text-xs mb-1">Total tenders</div>
          <div className="text-white text-2xl font-bold">{filtered.length}</div>
        </div>
        <div className="bg-navy-900 rounded-xl border border-navy-800 p-3">
          <div className="text-navy-600 text-xs mb-1">Active</div>
          <div className="text-white text-2xl font-bold">{stats?.total_active ?? filtered.filter((t) => t.stage !== 'award').length}</div>
        </div>
        <div className="bg-navy-900 rounded-xl border border-navy-800 p-3">
          <div className="text-navy-600 text-xs mb-1">Awarded since last upload</div>
          <div className={`text-2xl font-bold ${awardedSince && awardedSince.count > 0 ? 'text-emerald-400' : 'text-white'}`}>{awardedSince?.count ?? 0}</div>
        </div>
        <div className="bg-navy-900 rounded-xl border border-navy-800 p-3">
          <div className="text-navy-600 text-xs mb-1">Stalled ≥30d</div>
          <div className={`text-2xl font-bold ${stalled.length > 0 ? 'text-red-400' : 'text-white'}`}>{stalled.length}</div>
        </div>
        <div className="bg-navy-900 rounded-xl border border-navy-800 p-3">
          <div className="text-navy-600 text-xs mb-1">Inferred stages</div>
          <div className={`text-2xl font-bold ${flagCounts.inferred > 0 ? 'text-amber-400' : 'text-white'}`}>{flagCounts.inferred}</div>
        </div>
      </div>

      {/* Pipeline shape (counts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-navy-900 rounded-xl border border-navy-800 p-4">
          <h3 className="text-sm font-semibold text-white mb-4">Pipeline Shape</h3>
          <div className="space-y-2.5">
            {TENDER_STAGES.map((s) => {
              const count = byStage[s];
              const pct = Math.round((count / total) * 100);
              return (
                <div key={s}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-300">{STAGE_CONFIG[s].label}</span>
                    <span className="text-xs text-navy-600">{count}</span>
                  </div>
                  <div className="h-2 bg-navy-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: STAGE_CONFIG[s].color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-navy-900 rounded-xl border border-navy-800 p-4">
          <h3 className="text-sm font-semibold text-white mb-4">Agency Breakdown</h3>
          <div className="space-y-2">
            {byAgency.map(([agency, counts]) => (
              <div key={agency} className="flex items-center justify-between text-xs">
                <AgencyBadge agency={agency} />
                <div className="flex items-center gap-3 text-navy-600">
                  <span title="Active">{counts.active} active</span>
                  {counts.stalled > 0 && <span title="Stalled" className="text-red-400">{counts.stalled} stalled</span>}
                  <span title="Awarded">{counts.award} awarded</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-navy-900 rounded-xl border border-navy-800 p-4">
          <h3 className="text-sm font-semibold text-white mb-4">Procurement Method</h3>
          {byMethod.length === 0 ? (
            <p className="text-xs text-navy-600">No method data.</p>
          ) : (
            <div className="space-y-2">
              {byMethod.map(([label, count]) => {
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-300">{label}</span>
                      <span className="text-xs text-navy-600">{count} · {pct}%</span>
                    </div>
                    <div className="h-1.5 bg-navy-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gold-500/70 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-navy-900 rounded-xl border border-navy-800 p-4">
          <h3 className="text-sm font-semibold text-white mb-4">Flags</h3>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-300">{flagCounts.rollover}</div>
              <div className="text-[11px] text-navy-600 mt-1">Rollover</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-300">{flagCounts.exception}</div>
              <div className="text-[11px] text-navy-600 mt-1">See Remarks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-sky-300">{flagCounts.inferred}</div>
              <div className="text-[11px] text-navy-600 mt-1">Stage Inferred</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-300">{flagCounts.inheritedAwarded}</div>
              <div className="text-[11px] text-navy-600 mt-1">Inherited Award</div>
            </div>
          </div>
        </div>
      </div>

      {stalled.length > 0 && (
        <div className="bg-navy-900 rounded-xl border border-navy-800 p-4">
          <h3 className="text-sm font-semibold text-white mb-4">Stalled (≥30 days)</h3>
          <div className="space-y-1.5">
            {stalled.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <AgencyBadge agency={t.agency} />
                  <span className="text-slate-300 truncate">{t.description}</span>
                </div>
                <DaysAtStageIndicator days={t.days_at_current_stage} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
