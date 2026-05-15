import Link from 'next/link';
import {
  ArrowLeft,
  Anchor,
  Droplets,
  FileSpreadsheet,
  Lightbulb,
  Plane,
  PlaneLanding,
  Shield,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { GenerateReportButton } from '../GenerateReportModal';
import {
  agencyAccent,
  INTEL_AGENCY_META,
  type IntelAgency,
} from '@/lib/agencies';
import type { AgencyIntelData } from '@/lib/intel/get-agency-intel-data';

const ICON_BY_NAME: Record<string, LucideIcon> = {
  Zap,
  Droplets,
  Plane,
  PlaneLanding,
  Shield,
  Lightbulb,
  Anchor,
};

interface AgencyHeroProps {
  slug: IntelAgency;
  data: AgencyIntelData;
}

export function AgencyHero({ slug, data }: AgencyHeroProps) {
  const meta = INTEL_AGENCY_META[slug];
  if (!meta) return null;
  const Icon = ICON_BY_NAME[meta.iconName] ?? Zap;
  const accent = agencyAccent(slug);

  const openTasks = data.open_tasks.length;
  const overdueTasks = data.open_tasks.filter((t) => t.is_overdue).length;
  const delayedProjects = data.delayed_projects.length;
  const totalSlipDays = data.delayed_projects.reduce(
    (sum, p) => sum + (p.days_overdue ?? 0),
    0,
  );
  const criticalTenders = data.critical_procurement.length;
  const evalTenders = data.evaluation_tenders.length;

  const generated = new Date(data.generated_at);
  const generatedLabel = generated.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Subtitle composes the static agency descriptor with a single live signal so
  // the headline gives a one-glance read on agency state.
  let subtitle: string = meta.subtitle;
  if (data.gpl) {
    const total = data.gpl.station_health.length;
    const healthy = data.gpl.station_health.filter(
      (s) => s.status === 'healthy',
    ).length;
    subtitle = `${meta.subtitle} · ${healthy} of ${total} stations operational`;
  } else if (data.has) {
    const { operational, total } = data.has.airstrip_ops;
    subtitle = `${meta.subtitle} · ${operational} of ${total} airstrips operational`;
  }

  // Meta strip cells. All agencies show Tasks + Project slip. GPL surfaces
  // Outages MTD + Stations healthy; HAS surfaces airstrip totals. Other
  // agencies fall back to Procurement + Tenders so the strip stays full.
  const cells: MetaCell[] = [
    {
      label: 'Open tasks',
      value: openTasks.toString(),
      pill:
        overdueTasks > 0
          ? { tone: 'danger', text: `${overdueTasks} overdue` }
          : openTasks === 0
            ? { tone: 'ok', text: 'clear' }
            : null,
    },
    {
      label: 'Project slip',
      value: totalSlipDays > 0 ? `${totalSlipDays}d` : '0d',
      tone: totalSlipDays > 0 ? 'warn' : 'ok',
      pill:
        delayedProjects > 0
          ? {
              tone: 'warn',
              text: `${delayedProjects} project${delayedProjects === 1 ? '' : 's'}`,
            }
          : null,
    },
  ];

  if (data.gpl) {
    const outageMtd = data.gpl.outage_count_mtd;
    const deltaPct = data.gpl.grid_reliability.delta.outage_count_pct;
    const stations = data.gpl.station_health;
    const total = stations.length;
    const healthy = stations.filter((s) => s.status === 'healthy').length;
    const maint = stations.filter((s) => s.status === 'degraded').length;
    const critical = stations.filter((s) => s.status === 'critical').length;

    cells.push({
      label: 'Outages MTD',
      value: outageMtd.toString(),
      tone:
        outageMtd === 0 ? 'ok' : deltaPct != null && deltaPct > 0 ? 'danger' : undefined,
      pill:
        deltaPct != null
          ? {
              tone: deltaPct > 0 ? 'danger' : 'ok',
              text: `${deltaPct > 0 ? '+' : ''}${Math.round(deltaPct)}% MoM`,
            }
          : null,
    });
    cells.push({
      label: 'Stations healthy',
      value: total > 0 ? `${healthy}/${total}` : '—',
      tone: critical > 0 ? 'danger' : maint > 0 ? 'warn' : 'ok',
      pill:
        total > 0
          ? {
              tone: critical > 0 ? 'danger' : maint > 0 ? 'warn' : 'ok',
              text: `${Math.round((healthy / total) * 100)}%`,
            }
          : null,
      sub:
        maint + critical > 0
          ? `${maint} in maintenance · ${critical} critical`
          : null,
    });
  } else if (data.has) {
    const ops = data.has.airstrip_ops;
    cells.push({
      label: 'Airstrips ops',
      value: `${ops.operational}/${ops.total}`,
      tone: ops.closed > 0 ? 'danger' : ops.limited_or_rehab > 0 ? 'warn' : 'ok',
      pill:
        ops.closed > 0 || ops.limited_or_rehab > 0
          ? {
              tone: ops.closed > 0 ? 'danger' : 'warn',
              text: `${ops.closed} closed · ${ops.limited_or_rehab} limited`,
            }
          : { tone: 'ok', text: 'all operational' },
    });
    cells.push({
      label: 'Overdue inspections',
      value: ops.overdue_inspection.toString(),
      tone:
        ops.overdue_inspection === 0
          ? 'ok'
          : ops.overdue_inspection > 5
            ? 'danger'
            : 'warn',
      pill:
        ops.pending_verification > 0
          ? {
              tone: 'warn',
              text: `${ops.pending_verification} pending verify`,
            }
          : null,
    });
  } else {
    // Critical tenders and tenders-in-evaluation are two stages of the same
    // procurement pipeline, so they fold into a single Procurement cell.
    // Critical (stuck / missing-decision / stale-award) takes the headline
    // pill; evaluation count sits in the trailing sub line.
    const totalTenders = criticalTenders + evalTenders;
    cells.push({
      label: 'Procurement',
      value: totalTenders.toString(),
      tone: criticalTenders > 0 ? 'warn' : totalTenders > 0 ? undefined : 'ok',
      pill:
        criticalTenders > 0
          ? {
              tone: 'danger',
              text: `${criticalTenders} critical`,
            }
          : evalTenders > 0
            ? { tone: 'gold', text: `${evalTenders} in eval` }
            : { tone: 'ok', text: 'clear' },
      sub:
        criticalTenders > 0 && evalTenders > 0
          ? `${evalTenders} also in evaluation`
          : null,
    });

    // GWI-only: pending service applications. Other non-GPL/non-HAS agencies
    // (CJIA, GCAA, HECI, MARAD) have no equivalent signal, so the strip falls
    // back to 3 cells.
    if (data.gwi) {
      const pa = data.gwi.pending_applications;
      cells.push({
        label: 'Pending applications',
        value: pa.total.toLocaleString(),
        tone:
          pa.over_30_days > 0
            ? pa.over_30_days > pa.total * 0.25
              ? 'danger'
              : 'warn'
            : 'ok',
        pill:
          pa.over_30_days > 0
            ? {
                tone: pa.over_30_days > pa.total * 0.25 ? 'danger' : 'warn',
                text: `${pa.over_30_days.toLocaleString()} over 30d`,
              }
            : { tone: 'ok', text: 'all under 30d' },
        sub: `avg ${pa.avg_days_waiting}d · max ${pa.max_days_waiting}d`,
      });
    }
  }

  return (
    <header className="relative">
      {/* Top row: back breadcrumb pill + action buttons */}
      <div className="flex items-center justify-between gap-3 mb-7 md:mb-9 flex-wrap">
        <Link
          href="/intel"
          className="inline-flex items-center gap-2 h-8 pl-2 pr-3 rounded-full bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.12] hover:text-slate-200 text-[11px] font-medium tracking-[0.14em] uppercase text-navy-600 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Intel · Agencies</span>
        </Link>
        <div className="flex items-center gap-2.5">
          {slug === 'gpl' ? (
            <Link
              href="/intel/gpl/dbis"
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-[10px] bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.07] text-slate-300 hover:text-white text-[13px] font-medium transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Daily DBIS upload
            </Link>
          ) : null}
          <GenerateReportButton agency={slug} agencyDisplay={meta.display} />
        </div>
      </div>

      {/* Hero row: large gradient mark + eyebrow / title / subtitle */}
      <div className="grid grid-cols-[auto_1fr] gap-5 md:gap-6 items-center mb-9 md:mb-10">
        <div
          className={`relative h-[72px] w-[72px] md:h-[84px] md:w-[84px] rounded-[20px] md:rounded-[22px] bg-gradient-to-br ${meta.iconGradient} flex items-center justify-center shrink-0 ring-1 ring-white/30`}
          style={{
            boxShadow: `0 18px 48px -16px ${accent}66, inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -16px 24px -8px rgba(0,0,0,0.18)`,
          }}
          aria-hidden="true"
        >
          <Icon
            className="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]"
            size={38}
          />
        </div>
        <div className="min-w-0">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.28em] mb-1.5"
            style={{ color: accent }}
          >
            Agency Deep Dive
          </p>
          <h1 className="text-[40px] md:text-[54px] leading-[0.95] font-semibold tracking-[-0.035em] text-white">
            {meta.display}
          </h1>
          <p className="mt-2 text-sm text-navy-600 truncate">{subtitle}</p>
        </div>
      </div>

      {/* Meta strip — borderless number ledger. Column count tracks how many
          signals the agency actually has so the strip never shows phantom
          slots (e.g. agencies without applications data drop to 3 cells). */}
      <div
        className={`grid border-y border-white/[0.06] py-4 md:py-[18px] ${gridColsClass(cells.length)}`}
        role="group"
        aria-label="Agency at a glance"
      >
        {cells.map((cell, i) => (
          <MetaCellView key={cell.label} cell={cell} isFirst={i === 0} />
        ))}
        <span className="sr-only">Synced {generatedLabel}</span>
      </div>
    </header>
  );
}

// Mobile: stack at 1 col when only 3 cells (so the trailing cell doesn't
// orphan in a 2-col grid); 2 cols otherwise. Desktop: track cell count.
function gridColsClass(count: number): string {
  if (count <= 2) return 'grid-cols-2';
  if (count === 3) return 'grid-cols-1 md:grid-cols-3';
  return 'grid-cols-2 md:grid-cols-4';
}

type MetaTone = 'ok' | 'warn' | 'danger' | 'gold' | 'muted';

interface MetaCell {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'danger';
  pill?: { tone: MetaTone; text: string } | null;
  sub?: string | null;
}

const VALUE_TONE: Record<NonNullable<MetaCell['tone']>, string> = {
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  danger: 'text-red-400',
};

const PILL_TONE: Record<MetaTone, string> = {
  ok: 'bg-emerald-400/[0.14] text-emerald-400',
  warn: 'bg-amber-400/[0.14] text-amber-400',
  danger: 'bg-red-400/[0.14] text-red-400',
  gold: 'bg-gold-500/[0.14] text-gold-500',
  muted: 'bg-white/[0.05] text-navy-600',
};

function MetaCellView({ cell, isFirst }: { cell: MetaCell; isFirst: boolean }) {
  return (
    <div
      className={`flex flex-col gap-1 px-4 md:px-6 border-r last:border-r-0 border-white/[0.06] ${isFirst ? 'md:pl-0' : ''}`}
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-navy-600">
        {cell.label}
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-[22px] font-semibold tracking-[-0.02em] tabular-nums ${cell.tone ? VALUE_TONE[cell.tone] : 'text-white'}`}
        >
          {cell.value}
        </span>
        {cell.pill ? (
          <span
            className={`inline-flex items-center h-[22px] px-2.5 rounded-full text-[11px] font-semibold ${PILL_TONE[cell.pill.tone]}`}
          >
            {cell.pill.text}
          </span>
        ) : null}
      </div>
      {cell.sub ? (
        <span className="text-[11px] text-navy-600 font-mono tracking-[0.02em]">
          {cell.sub}
        </span>
      ) : null}
    </div>
  );
}
