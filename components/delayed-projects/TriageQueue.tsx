'use client';

import { useState, useMemo } from 'react';
import { AGENCY_HEX_COLORS } from '@/lib/constants/agencies';
import { fmtCurrency } from '@/components/oversight/types';
import { getShortName } from '@/lib/delayed-projects/short-names';
import type { DelayedProjectWithComputed, RiskTier } from '@/lib/delayed-projects/types';
import { AgencyBadge, DaysOverdueBadge, RISK_TIER_HEX, ExposureBar } from './shared';

interface TriageQueueProps {
  projects: DelayedProjectWithComputed[];
  isMobile: boolean;
}

interface RankedProject extends DelayedProjectWithComputed {
  riskScore: number;
  shortName: string;
}

const INITIAL_VISIBLE = 25;

export function TriageQueue({ projects, isMobile }: TriageQueueProps) {
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Compute agency counts from full list (stable across filter changes)
  const agencyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) {
      counts.set(p.sub_agency, (counts.get(p.sub_agency) || 0) + 1);
    }
    return counts;
  }, [projects]);

  const agencies = useMemo(() =>
    Array.from(agencyCounts.entries()).sort((a, b) => b[1] - a[1]),
  [agencyCounts]);

  // Rank projects by composite risk score + build O(1) rank lookup
  const { ranked, rankMap } = useMemo(() => {
    let maxRemaining = 1;
    for (const p of projects) {
      if (p.remaining_value > maxRemaining) maxRemaining = p.remaining_value;
    }

    const scored: RankedProject[] = projects.map(p => ({
      ...p,
      riskScore: (p.days_overdue ?? 0) * (p.remaining_value / maxRemaining),
      shortName: getShortName(p.project_name),
    }));

    scored.sort((a, b) => b.riskScore - a.riskScore);

    const map = new Map<string, number>();
    for (let i = 0; i < scored.length; i++) {
      map.set(scored[i].id, i + 1);
    }

    return { ranked: scored, rankMap: map };
  }, [projects]);

  // Filter by selected agency
  const filtered = useMemo(() => {
    if (!selectedAgency) return ranked;
    return ranked.filter(p => p.sub_agency === selectedAgency);
  }, [ranked, selectedAgency]);

  const maxRiskScore = useMemo(() => {
    let max = 1;
    for (const p of filtered) {
      if (p.riskScore > max) max = p.riskScore;
    }
    return max;
  }, [filtered]);

  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE);
  const hasMore = filtered.length > INITIAL_VISIBLE;

  if (projects.length === 0) return null;

  return (
    <div className="card-premium p-4 md:p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white">Triage Queue</h3>

      {/* Agency filter chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => { setSelectedAgency(null); setShowAll(false); }}
          className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            selectedAgency === null
              ? 'bg-gold-500/20 text-gold-400 border-gold-500/40'
              : 'bg-navy-900 text-slate-400 border-navy-800 hover:border-slate-600'
          }`}
        >
          ALL <span className="text-[10px] ml-1 opacity-70">{projects.length}</span>
        </button>
        {agencies.map(([agency, count]) => {
          const color = AGENCY_HEX_COLORS[agency] || '#64748b';
          const isActive = selectedAgency === agency;
          return (
            <button
              key={agency}
              onClick={() => { setSelectedAgency(isActive ? null : agency); setShowAll(false); }}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                isActive
                  ? 'border-opacity-60'
                  : 'bg-navy-900 border-navy-800 hover:border-slate-600'
              }`}
              style={isActive ? {
                backgroundColor: `${color}20`,
                color,
                borderColor: `${color}60`,
              } : { color: '#94a3b8' }}
            >
              {agency} <span className="text-[10px] ml-1 opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Ranked list */}
      <div className="space-y-1">
        {visible.map((p, idx) => {
          const globalRank = selectedAgency ? (rankMap.get(p.id) ?? idx + 1) : idx + 1;
          const borderColor = RISK_TIER_HEX[p.risk_tier as RiskTier] || RISK_TIER_HEX.LOW;
          const scoreWidth = (p.riskScore / maxRiskScore) * 100;

          return (
            <div
              key={p.id}
              className="flex items-center gap-2 md:gap-3 py-2 px-3 rounded-lg bg-navy-950/40 hover:bg-navy-900/60 transition-colors border-l-[3px]"
              style={{ borderLeftColor: borderColor }}
            >
              {/* Rank */}
              <span className="text-xs text-navy-600 font-mono w-6 shrink-0 text-right tabular-nums">
                #{globalRank}
              </span>

              {/* Agency badge */}
              <span className="shrink-0">
                <AgencyBadge agency={p.sub_agency} />
              </span>

              {/* Project name + contractor */}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white font-medium truncate" title={p.project_name}>
                  {p.shortName}
                </p>
                {!isMobile && (
                  <p className="text-[10px] text-slate-500 truncate">
                    {p.contractors || 'No contractor'}
                  </p>
                )}
              </div>

              {/* Completion */}
              <div className="hidden sm:flex items-center gap-1.5 shrink-0 w-16">
                <ExposureBar pct={Math.min(p.completion_percent, 100)} />
                <span className="text-[10px] text-slate-400 tabular-nums w-7 text-right">
                  {Math.round(p.completion_percent)}%
                </span>
              </div>

              {/* Days overdue */}
              <span className="shrink-0">
                <DaysOverdueBadge days={p.days_overdue} />
              </span>

              {/* Remaining value */}
              <span className="text-xs text-white tabular-nums shrink-0 w-14 text-right hidden md:block">
                {fmtCurrency(p.remaining_value / 100)}
              </span>

              {/* Risk score bar */}
              <div className="hidden lg:block w-20 shrink-0">
                <ExposureBar pct={scoreWidth} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more / less */}
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-xs text-gold-500 hover:text-gold-400 transition-colors"
        >
          {showAll ? 'Show less' : `Show all ${filtered.length} projects`}
        </button>
      )}
    </div>
  );
}
