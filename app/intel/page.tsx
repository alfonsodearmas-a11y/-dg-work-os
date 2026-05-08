'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Anchor,
  ArrowUpRight,
  Droplets,
  Lightbulb,
  Plane,
  PlaneLanding,
  Radio,
  Shield,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { INTEL_AGENCIES, INTEL_AGENCY_META, type IntelAgency } from '@/lib/agencies';

const ICON_BY_NAME: Record<string, LucideIcon> = {
  Zap,
  Droplets,
  Plane,
  PlaneLanding,
  Shield,
  Lightbulb,
  Anchor,
};

interface AgencySummary {
  agency: IntelAgency;
  openTasksCount: number;
  openTasksOverdue: number;
  delayedProjectsCount: number;
  evaluationTendersCount: number;
  evaluationTendersStale: number;
  evaluationTendersCritical: number;
}

type AttentionLevel = 'critical' | 'warn' | 'calm';

// Status-dot rules — extends the original task/project rules with
// evaluation-tender thresholds. Day cutoffs (>14 / >30) are sourced from
// lib/procurement/queries.ts so the per-agency card and this picker classifier
// can never drift apart.
function classifyAttention(s: AgencySummary | undefined): AttentionLevel {
  if (!s) return 'calm';
  if (
    s.openTasksOverdue > 0 ||
    s.delayedProjectsCount >= 5 ||
    s.evaluationTendersCritical > 0
  )
    return 'critical';
  if (
    s.delayedProjectsCount > 0 ||
    s.openTasksCount >= 8 ||
    s.evaluationTendersCount > 0
  )
    return 'warn';
  return 'calm';
}

const ATTENTION_LABEL: Record<AttentionLevel, string> = {
  critical: 'Needs attention',
  warn: 'Watching',
  calm: 'Steady',
};

const ATTENTION_DOT: Record<AttentionLevel, string> = {
  critical: 'bg-red-400 shadow-[0_0_0_4px_rgba(248,113,113,0.18)]',
  warn: 'bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.18)]',
  calm: 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]',
};

export default function IntelPage() {
  const [summaries, setSummaries] = useState<Record<string, AgencySummary>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/intel/summary');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { agencies: AgencySummary[] };
        if (cancelled) return;
        const map: Record<string, AgencySummary> = {};
        for (const a of body.agencies) map[a.agency] = a;
        setSummaries(map);
      } catch {
        if (!cancelled) setSummaries({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    let openTasks = 0;
    let overdue = 0;
    let delayed = 0;
    let evaluation = 0;
    let needsAttention = 0;
    for (const slug of INTEL_AGENCIES) {
      const s = summaries[slug];
      if (!s) continue;
      openTasks += s.openTasksCount;
      overdue += s.openTasksOverdue;
      delayed += s.delayedProjectsCount;
      evaluation += s.evaluationTendersCount;
      if (classifyAttention(s) !== 'calm') needsAttention++;
    }
    return { openTasks, overdue, delayed, evaluation, needsAttention };
  }, [summaries]);

  return (
    <div className="space-y-8">
      {/* Editorial header */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-gold-500/30 to-gold-500/10 border border-gold-500/30 flex items-center justify-center shrink-0">
            <Radio className="h-5 w-5 text-gold-500" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-gold-500/80">Ministry · Intel</p>
            <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">
              Agency Intel
            </h1>
            <p className="text-navy-600 text-sm mt-0.5">
              Seven agencies. One pane. Pick the desk that needs you.
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-right w-full sm:w-auto sm:min-w-[28rem]">
          <SummaryStat label="Needs attention" value={totals.needsAttention} loading={loading} tone={totals.needsAttention > 0 ? 'warn' : 'calm'} />
          <SummaryStat label="Overdue tasks" value={totals.overdue} loading={loading} tone={totals.overdue > 0 ? 'bad' : 'calm'} />
          <SummaryStat label="Delayed projects" value={totals.delayed} loading={loading} />
          <SummaryStat label="In evaluation" value={totals.evaluation} loading={loading} />
        </dl>
      </header>

      {/* Hairline divider — quiet, navy */}
      <div className="h-px bg-gradient-to-r from-transparent via-navy-800 to-transparent" />

      {/* Tile grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {INTEL_AGENCIES.map((slug) => {
          const meta = INTEL_AGENCY_META[slug];
          if (!meta) return null;
          const Icon = ICON_BY_NAME[meta.iconName] ?? Zap;
          const summary = summaries[slug];
          const attention = classifyAttention(summary);

          const overdue = summary?.openTasksOverdue ?? 0;
          const delayedHigh = (summary?.delayedProjectsCount ?? 0) >= 5;
          const stale = summary?.evaluationTendersStale ?? 0;
          const evalCritical = (summary?.evaluationTendersCritical ?? 0) > 0;

          return (
            <Link
              key={slug}
              href={`/intel/${slug}`}
              className="group card-premium p-6 border-navy-800 hover:border-gold-500/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_-8px_rgba(212,175,55,0.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60"
              aria-label={`${meta.display} — ${meta.subtitle}`}
            >
              {/* Header */}
              <div className="flex items-start gap-3">
                <div
                  className={`h-12 w-12 rounded-xl bg-gradient-to-br ${meta.iconGradient} flex items-center justify-center shrink-0 shadow-lg shadow-black/20 ring-1 ring-white/10`}
                >
                  <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-white tracking-tight leading-tight">
                      {meta.display}
                    </h2>
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${ATTENTION_DOT[attention]}`}
                      aria-label={ATTENTION_LABEL[attention]}
                    />
                  </div>
                  <p className="text-navy-600 text-[13px] leading-snug mt-0.5 line-clamp-1">
                    {meta.subtitle}
                  </p>
                </div>
                <ArrowUpRight
                  className="h-4 w-4 text-navy-700 group-hover:text-gold-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all shrink-0 mt-1"
                  aria-hidden="true"
                />
              </div>

              {/* Hero metric. The overdue chip slot is always reserved
                  (`h-4`) so the eyebrow label sits at the same baseline across
                  all seven tiles, whether overdue is zero or not. */}
              <div className="mt-6 flex items-end gap-4">
                <span className="text-5xl font-semibold text-white tabular-nums tracking-tight leading-none">
                  {loading ? '—' : summary?.openTasksCount ?? 0}
                </span>
                <div className="pb-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-navy-600">
                    Open tasks
                  </p>
                  <p className="mt-0.5 h-4 text-xs text-red-400 leading-4">
                    {overdue > 0 ? `${overdue} overdue` : ' '}
                  </p>
                </div>
              </div>

              {/* Hairline */}
              <div className="mt-6 border-t border-navy-800/80" aria-hidden="true" />

              {/* Supporting metrics. Each column reserves a chip slot
                  (`h-4`) whether or not a chip renders, so tile heights stay
                  uniform across the grid even when only some agencies trip a
                  high-exposure or stale callout. */}
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-navy-600">
                    Delayed projects
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-white tabular-nums leading-none">
                    {loading ? '—' : summary?.delayedProjectsCount ?? 0}
                  </p>
                  <p className="mt-1 h-4 text-xs text-amber-400 leading-4">
                    {delayedHigh ? 'high exposure' : ' '}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-navy-600">
                    Tenders in eval.
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-white tabular-nums leading-none">
                    {loading ? '—' : summary?.evaluationTendersCount ?? 0}
                  </p>
                  <p
                    className={`mt-1 h-4 text-xs leading-4 ${evalCritical ? 'text-red-400' : 'text-amber-400'}`}
                  >
                    {stale > 0 ? `${stale} stale` : ' '}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  loading,
  tone,
}: {
  label: string;
  value: number;
  loading: boolean;
  tone?: 'bad' | 'warn' | 'calm';
}) {
  const valueClass =
    tone === 'bad'
      ? 'text-red-400'
      : tone === 'warn'
        ? 'text-amber-400'
        : 'text-white';
  return (
    <div className="flex-1 min-w-0 px-4 py-2 rounded-xl bg-navy-900/60 border border-navy-800">
      <dt className="text-[10px] uppercase tracking-wider text-navy-600 truncate">{label}</dt>
      <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${valueClass}`}>
        {loading ? '—' : value.toLocaleString()}
      </dd>
    </div>
  );
}

