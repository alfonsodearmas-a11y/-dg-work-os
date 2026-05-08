'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  Activity,
  AlertTriangle,
  Anchor,
  Briefcase,
  CheckSquare,
  ClipboardCheck,
  Droplets,
  FileText,
  Gauge,
  Lightbulb,
  Plane,
  PlaneLanding,
  Plug,
  Shield,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { GenerateReportButton } from './GenerateReportModal';
import { INTEL_AGENCY_META, type IntelAgency } from '@/lib/agencies';
import { PRIORITY_DOT } from '@/lib/constants/task-styles';
import { formatDuration } from '@/lib/calendar-utils';
import type {
  AgencyIntelData,
  AgencyOpenTask,
  AgencyOutstandingApplications,
  AirstripOpsRow,
  ApplicationThroughput,
  GridReliability,
  HasAirstripOps,
  StationHealthRow,
  RecentOutageRow,
} from '@/lib/intel/get-agency-intel-data';
import type { DelayedProjectWithComputed } from '@/lib/delayed-projects/types';
import {
  EVAL_DANGER_DAYS,
  EVAL_WARN_DAYS,
  type CriticalTenderRow,
  type EvaluationTenderRow,
} from '@/lib/procurement/queries';

interface Props {
  slug: IntelAgency;
}

const ICON_BY_NAME: Record<string, LucideIcon> = {
  Zap,
  Droplets,
  Plane,
  PlaneLanding,
  Shield,
  Lightbulb,
  Anchor,
};

/**
 * Single shared per-agency intel page. Every /intel/{agency} URL renders this
 * component. Reads display metadata from `lib/agencies.ts` — wrappers are
 * gone, the dynamic route at `app/intel/[agency]/page.tsx` is the only entry.
 */
export function AgencyIntelPage({ slug }: Props) {
  const meta = INTEL_AGENCY_META[slug]!;
  const Icon = ICON_BY_NAME[meta.iconName] ?? Zap;

  const [data, setData] = useState<AgencyIntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Default cache lets the browser HTTP cache cooperate with the route's
      // s-maxage=60 header. Toggling between agencies inside that window is free.
      const res = await fetch(`/api/intel/${slug}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setData((await res.json()) as AgencyIntelData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex items-center gap-3 md:gap-4 flex-wrap">
          <Link
            href="/intel"
            className="inline-flex items-center gap-1.5 p-2 pr-3 rounded-lg bg-navy-900 border border-navy-800 hover:border-gold-500 transition-colors touch-active shrink-0 text-slate-400 hover:text-white text-xs uppercase tracking-wider"
            aria-label="Back to Agency Intel"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Intel</span>
          </Link>
          <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
            <div
              className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${meta.iconGradient} flex items-center justify-center shrink-0 shadow-lg shadow-black/20 ring-1 ring-white/10`}
            >
              <Icon className="text-white" size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-500/80">
                Agency Deep Dive
              </p>
              <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight leading-tight truncate">
                {meta.display}
              </h1>
              <p className="text-navy-600 text-sm truncate">{meta.subtitle}</p>
            </div>
          </div>
          <GenerateReportButton agency={slug} agencyDisplay={meta.display} />
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-navy-800 to-transparent" />
      </header>

      {error && !data ? (
        <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-6 text-sm text-red-400">
          Failed to load: {error}
        </div>
      ) : null}

      <CardStack data={data} loading={loading} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card stack
// ---------------------------------------------------------------------------

function CardStack({ data, loading }: { data: AgencyIntelData | null; loading: boolean }) {
  const open = data?.open_tasks ?? [];
  const delayed = data?.delayed_projects ?? [];
  const procurement = data?.critical_procurement ?? [];
  const evaluation = data?.evaluation_tenders ?? [];
  const overdue = open.filter((t) => t.is_overdue).length;
  const totalDelayDays = delayed.reduce(
    (s, p) => s + Math.max(0, p.days_overdue ?? 0),
    0,
  );

  return (
    <div className="space-y-3">
      <CollapsibleSection
        title="Open Tasks"
        icon={CheckSquare}
        defaultOpen={false}
        badge={
          loading
            ? undefined
            : {
                text: overdue > 0 ? `${open.length} · ${overdue} overdue` : `${open.length}`,
                variant: overdue > 0 ? 'danger' : 'default',
              }
        }
      >
        {loading ? <CardSkeleton /> : <OpenTasksList items={open} />}
      </CollapsibleSection>

      <CollapsibleSection
        title="Delayed Projects"
        icon={AlertTriangle}
        defaultOpen={false}
        badge={
          loading
            ? undefined
            : {
                text:
                  totalDelayDays > 0
                    ? `${delayed.length} · ${totalDelayDays}d slip`
                    : `${delayed.length}`,
                variant: delayed.length > 0 ? 'warning' : 'default',
              }
        }
      >
        {loading ? <CardSkeleton /> : <DelayedProjectsList items={delayed} />}
      </CollapsibleSection>

      <CollapsibleSection
        title="Critical Procurement"
        icon={Briefcase}
        defaultOpen={false}
        badge={
          loading
            ? undefined
            : {
                text: `${procurement.length}`,
                variant: procurement.length > 0 ? 'warning' : 'default',
              }
        }
      >
        {loading ? <CardSkeleton /> : <ProcurementList items={procurement} />}
      </CollapsibleSection>

      <CollapsibleSection
        title="Tenders in Evaluation"
        subtitle="Bids closed; awaiting TEC/NPTAB recommendation"
        icon={ClipboardCheck}
        defaultOpen={false}
        badge={loading ? undefined : evaluationBadge(evaluation)}
      >
        {loading ? <CardSkeleton /> : <EvaluationTendersList items={evaluation} />}
      </CollapsibleSection>

      {data?.gpl ? (
        <>
          <CollapsibleSection
            title="Grid Reliability"
            subtitle="MTD vs prior month — SAIDI, SAIFI, customer-hours lost"
            icon={Plug}
            defaultOpen={false}
            badge={gridReliabilityBadge(data.gpl.grid_reliability)}
          >
            <GridReliabilityBody data={data.gpl.grid_reliability} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Pending Service Applications"
            icon={FileText}
            defaultOpen={false}
            badge={{
              text:
                data.gpl.outstanding_applications.oldest_days != null
                  ? `${data.gpl.outstanding_applications.total} · oldest ${data.gpl.outstanding_applications.oldest_days}d`
                  : `${data.gpl.outstanding_applications.total}`,
              variant:
                (data.gpl.outstanding_applications.by_age_bucket['90_plus'] ?? 0) > 0
                  ? 'danger'
                  : data.gpl.outstanding_applications.total > 0
                    ? 'warning'
                    : 'default',
            }}
          >
            <PendingApplicationsBody data={data.gpl.outstanding_applications} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Application Efficiency"
            subtitle="Throughput, average time-to-decision, backlog trend"
            icon={Gauge}
            defaultOpen={false}
            badge={throughputBadge(data.gpl.application_throughput)}
          >
            <ApplicationThroughputBody data={data.gpl.application_throughput} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Station Availability"
            icon={Gauge}
            defaultOpen={false}
            badge={stationBadge(data.gpl.station_health)}
          >
            <StationAvailabilityBody stations={data.gpl.station_health} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Outages"
            icon={Activity}
            defaultOpen={false}
            badge={outageBadge(data.gpl.recent_outages, data.gpl.outage_count_mtd)}
          >
            <OutagesBody outages={data.gpl.recent_outages} mtd={data.gpl.outage_count_mtd} />
          </CollapsibleSection>
        </>
      ) : null}

      {data?.has ? (
        <CollapsibleSection
          title="Airstrip Operations"
          subtitle="Inspection cadence and verification backlog"
          icon={PlaneLanding}
          defaultOpen={false}
          badge={airstripOpsBadge(data.has.airstrip_ops)}
        >
          <AirstripOpsBody data={data.has.airstrip_ops} />
        </CollapsibleSection>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic link list — replaces three near-identical hand-rolled list bodies.
// ---------------------------------------------------------------------------

interface LinkRow {
  href: string;
  dotClass: string;
  primary: string;
  meta: React.ReactNode;
}

function LinkList<T extends { id: string }>({
  items,
  project,
}: {
  items: T[];
  project: (item: T) => LinkRow;
}) {
  if (items.length === 0) return <EmptyBody />;
  return (
    <ul className="divide-y divide-navy-800/60">
      {items.map((item) => {
        const row = project(item);
        return (
          <li key={item.id}>
            <Link
              href={row.href}
              className="flex items-start gap-3 py-2.5 px-1 rounded transition-colors hover:bg-navy-900/40"
            >
              <span className={`mt-1 inline-flex h-2 w-2 rounded-full shrink-0 ${row.dotClass}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{row.primary}</p>
                <p className="mt-1 text-[11px] text-navy-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {row.meta}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Section bodies
// ---------------------------------------------------------------------------

function OpenTasksList({ items }: { items: AgencyOpenTask[] }) {
  const sorted = [...items].sort(sortOpenTasks);
  return (
    <LinkList
      items={sorted}
      project={(t) => ({
        href: `/tasks?taskId=${t.id}`,
        dotClass: (t.priority && PRIORITY_DOT[t.priority]) || 'bg-navy-700',
        primary: t.title,
        meta: (
          <>
            <span className="uppercase">{t.status.replace(/_/g, ' ')}</span>
            {t.owner_name ? <span>· {t.owner_name}</span> : null}
            {t.due_date ? (
              <span className={t.is_overdue ? 'text-red-400' : ''}>
                · due {t.due_date}
                {t.is_overdue ? ' (overdue)' : ''}
              </span>
            ) : (
              <span>· no due date</span>
            )}
          </>
        ),
      })}
    />
  );
}

function sortOpenTasks(a: AgencyOpenTask, b: AgencyOpenTask): number {
  if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date.localeCompare(b.due_date);
}

const RISK_DOT: Record<DelayedProjectWithComputed['risk_tier'], string> = {
  HIGH: 'bg-red-400',
  MEDIUM: 'bg-amber-400',
  LOW: 'bg-emerald-500',
  NO_DATA: 'bg-navy-700',
};

function DelayedProjectsList({ items }: { items: DelayedProjectWithComputed[] }) {
  // getProjects() pre-sorts by overdue desc — no client-side sort needed.
  return (
    <LinkList
      items={items}
      project={(p) => ({
        href: `/oversight?projectId=${p.id}`,
        dotClass: RISK_DOT[p.risk_tier] ?? 'bg-navy-700',
        primary: p.project_name,
        meta: (
          <>
            <span>
              {typeof p.completion_percent === 'number'
                ? `${Math.round(Number(p.completion_percent))}% complete`
                : '— complete'}
            </span>
            {p.days_overdue != null && p.days_overdue > 0 ? (
              <span className="text-red-400">· {p.days_overdue}d overdue</span>
            ) : null}
            {p.contractors ? <span>· {p.contractors}</span> : null}
          </>
        ),
      })}
    />
  );
}

const PROCUREMENT_REASON_LABEL: Record<CriticalTenderRow['reason'], string> = {
  missing_pending_decision: 'Missing — pending decision',
  missing_from_upload: 'Missing from upload',
  stale_award: 'Stale award',
};

function ProcurementList({ items }: { items: CriticalTenderRow[] }) {
  return (
    <LinkList
      items={items}
      project={(t) => ({
        href: `/procurement?tender=${t.id}`,
        dotClass: 'bg-amber-400',
        primary: t.description,
        meta: (
          <>
            <span className="uppercase">{t.stage.replace(/_/g, ' ')}</span>
            <span>· {PROCUREMENT_REASON_LABEL[t.reason]}</span>
            {t.days_in_stage != null ? <span>· {t.days_in_stage}d in stage</span> : null}
            {t.next_action_owner ? <span>· next: {t.next_action_owner}</span> : null}
          </>
        ),
      })}
    />
  );
}

// ---------------------------------------------------------------------------
// Tenders in Evaluation — bids closed, awaiting TEC/NPTAB. Visual structure
// matches Critical Procurement above.
// ---------------------------------------------------------------------------

function evaluationBadge(items: EvaluationTenderRow[]):
  | { text: string; variant: 'default' | 'warning' | 'danger' }
  | undefined {
  if (items.length === 0) return { text: '0', variant: 'default' };
  let oldest = 0;
  for (const r of items) {
    if (r.days_in_stage != null && r.days_in_stage > oldest) oldest = r.days_in_stage;
  }
  const variant: 'default' | 'warning' | 'danger' =
    oldest > EVAL_DANGER_DAYS ? 'danger' : oldest > EVAL_WARN_DAYS ? 'warning' : 'default';
  return {
    text: oldest > 0 ? `${items.length} · oldest ${oldest}d` : `${items.length}`,
    variant,
  };
}

function evaluationDot(days: number | null): string {
  if (days == null) return 'bg-navy-700';
  if (days > EVAL_DANGER_DAYS) return 'bg-red-400';
  if (days > EVAL_WARN_DAYS) return 'bg-amber-400';
  return 'bg-emerald-500';
}

function EvaluationTendersList({ items }: { items: EvaluationTenderRow[] }) {
  return (
    <LinkList
      items={items}
      project={(t) => ({
        href: `/procurement?tender=${t.id}`,
        dotClass: evaluationDot(t.days_in_stage),
        primary: t.description,
        meta: (
          <>
            <span className="uppercase">EVALUATION</span>
            {t.days_in_stage != null ? <span>· {t.days_in_stage}d in stage</span> : null}
            {t.sub_programme_name ? (
              <span>· {t.sub_programme_name}</span>
            ) : t.sub_programme_code ? (
              <span>· {t.sub_programme_code}</span>
            ) : null}
            {t.next_action_owner ? <span>· next: {t.next_action_owner}</span> : null}
          </>
        ),
      })}
    />
  );
}

// ---------------------------------------------------------------------------
// HAS — Airstrip Operations. Tile row + overdue list. Single section, mirrors
// the visual weight of GPL's Outages and Station Availability cards.
// ---------------------------------------------------------------------------

function airstripOpsBadge(o: HasAirstripOps):
  | { text: string; variant: 'default' | 'success' | 'warning' | 'danger' }
  | undefined {
  if (o.total === 0) return undefined;
  const variant: 'success' | 'warning' | 'danger' =
    o.overdue_inspection === 0
      ? 'success'
      : o.overdue_inspection >= o.total / 2
        ? 'danger'
        : 'warning';
  return { text: `${o.overdue_inspection}/${o.total} overdue`, variant };
}

const CONDITION_TEXT: Record<string, string> = {
  Good: 'text-emerald-400',
  Satisfactory: 'text-amber-400',
  Poor: 'text-red-400',
};

function AirstripOpsBody({ data }: { data: HasAirstripOps }) {
  if (data.total === 0) return <EmptyBody text="No airstrip data" />;
  const tiles: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' }[] = [
    { label: 'Operational', value: data.operational.toLocaleString() },
    {
      label: 'Limited / rehab',
      value: data.limited_or_rehab.toLocaleString(),
      tone: data.limited_or_rehab > 0 ? 'warn' : undefined,
    },
    {
      label: 'Overdue inspection',
      value: data.overdue_inspection.toLocaleString(),
      sub: `of ${data.total.toLocaleString()}`,
      tone: data.overdue_inspection > 0 ? 'bad' : undefined,
    },
    {
      label: 'Pending verification',
      value: data.pending_verification.toLocaleString(),
      tone: data.pending_verification > 0 ? 'warn' : undefined,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {tiles.map((t) => (
          <KpiTile key={t.label} {...t} />
        ))}
      </div>
      {data.overdue_inspection === 0 ? (
        <p className="text-[11px] text-navy-600">
          All airstrips inspected within the last 6 months.
        </p>
      ) : (
        <AirstripOverdueList items={data.overdue} />
      )}
    </div>
  );
}

function AirstripOverdueList({ items }: { items: AirstripOpsRow[] }) {
  return (
    <LinkList
      items={items}
      project={(a) => ({
        href: `/airstrips/${a.id}`,
        dotClass:
          a.last_inspection_date == null
            ? 'bg-red-400'
            : (a.days_since_inspection ?? 0) > 365
              ? 'bg-red-400'
              : 'bg-amber-400',
        primary: a.name,
        meta: (
          <>
            <span>Region {a.region}</span>
            <span>
              ·{' '}
              {a.last_inspection_date == null
                ? 'Never inspected'
                : `Last inspected ${a.last_inspection_date}`}
            </span>
            {a.days_since_inspection != null ? (
              <span className="text-red-400">· {a.days_since_inspection}d ago</span>
            ) : null}
            {a.surface_condition ? (
              <span className={CONDITION_TEXT[a.surface_condition] ?? 'text-navy-600'}>
                · {a.surface_condition}
              </span>
            ) : null}
          </>
        ),
      })}
    />
  );
}

function PendingApplicationsBody({ data }: { data: AgencyOutstandingApplications }) {
  if (data.total === 0) return <EmptyBody />;
  const buckets: Array<{ label: string; key: keyof typeof data.by_age_bucket; emphasize?: boolean }> = [
    { label: '0–30 days', key: '0_30' },
    { label: '31–60 days', key: '31_60' },
    { label: '61–90 days', key: '61_90' },
    { label: '90+ days', key: '90_plus', emphasize: data.by_age_bucket['90_plus'] > 0 },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-navy-600 mb-2">By status</p>
        <ul className="space-y-1">
          {Object.entries(data.by_status)
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => (
              <li key={status} className="flex items-center justify-between">
                <span className="text-navy-600 capitalize">{status.replace(/_/g, ' ')}</span>
                <span className="text-white tabular-nums">{count}</span>
              </li>
            ))}
        </ul>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-navy-600 mb-2">Aging</p>
        <ul className="space-y-1">
          {buckets.map((b) => (
            <li key={b.key} className="flex items-center justify-between">
              <span className={b.emphasize ? 'text-red-400' : 'text-navy-600'}>{b.label}</span>
              <span
                className={`tabular-nums ${b.emphasize ? 'text-red-400' : 'text-white'}`}
              >
                {data.by_age_bucket[b.key]}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grid Reliability — SAIDI / SAIFI / customer-hours, MTD vs prior month.
// ---------------------------------------------------------------------------

function gridReliabilityBadge(g: GridReliability):
  | { text: string; variant: 'default' | 'warning' | 'danger' | 'success' }
  | undefined {
  const m = g.mtd;
  if (m.outage_count === 0) return { text: 'No outages MTD', variant: 'success' };
  const delta = g.delta.customer_hours_lost_pct;
  const variant =
    delta == null ? 'warning' : delta > 25 ? 'danger' : delta < -25 ? 'success' : 'warning';
  return { text: `${m.outage_count} outages MTD`, variant };
}

function ApplicationThroughputBody({ data }: { data: ApplicationThroughput }) {
  const tiles: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' }[] = [
    {
      label: 'Closed (30d)',
      value: data.closed_30d.toLocaleString(),
      sub: `${data.submitted_30d.toLocaleString()} new`,
    },
    {
      label: 'Avg time to close',
      value: data.avg_days_to_close != null ? `${data.avg_days_to_close.toFixed(1)}d` : '—',
      tone:
        data.avg_days_to_close == null
          ? undefined
          : data.avg_days_to_close > 60
            ? 'bad'
            : data.avg_days_to_close > 30
              ? 'warn'
              : 'good',
    },
    {
      label: 'Backlog change',
      value:
        data.backlog_change_30d > 0
          ? `+${data.backlog_change_30d.toLocaleString()}`
          : data.backlog_change_30d.toLocaleString(),
      sub: `${data.backlog_now.toLocaleString()} open now`,
      tone: data.backlog_change_30d > 0 ? 'bad' : data.backlog_change_30d < 0 ? 'good' : undefined,
    },
    {
      label: 'Approval rate',
      value:
        data.approval_rate_pct != null ? `${Math.round(data.approval_rate_pct)}%` : '—',
    },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      {tiles.map((t) => (
        <KpiTile key={t.label} {...t} />
      ))}
    </div>
  );
}

function throughputBadge(t: ApplicationThroughput):
  | { text: string; variant: 'default' | 'warning' | 'danger' | 'success' }
  | undefined {
  if (t.closed_30d === 0 && t.submitted_30d === 0) return undefined;
  const variant =
    t.backlog_change_30d > 0 ? 'warning' : t.backlog_change_30d < 0 ? 'success' : 'default';
  return {
    text: `${t.closed_30d} closed · ${t.submitted_30d} new`,
    variant,
  };
}

function GridReliabilityBody({ data }: { data: GridReliability }) {
  if (data.mtd.outage_count === 0 && data.prior_month.outage_count === 0) {
    return <EmptyBody text="No outage data" />;
  }
  const tiles: {
    label: string;
    value: string;
    delta: number | null;
    invert?: boolean; // higher is bad
    sub?: string;
  }[] = [
    {
      label: 'Outages',
      value: data.mtd.outage_count.toLocaleString(),
      delta: data.delta.outage_count_pct,
      invert: true,
      sub: `${data.prior_month.outage_count.toLocaleString()} prior month`,
    },
    {
      label: 'Customer-hours lost',
      value: formatCompactNumber(data.mtd.customer_hours_lost),
      delta: data.delta.customer_hours_lost_pct,
      invert: true,
      sub: `${formatCompactNumber(data.prior_month.customer_hours_lost)} prior`,
    },
    {
      label: 'SAIDI (min)',
      value: data.mtd.saidi_minutes != null ? data.mtd.saidi_minutes.toFixed(1) : '—',
      delta: data.delta.saidi_pct,
      invert: true,
      sub:
        data.prior_month.saidi_minutes != null
          ? `${data.prior_month.saidi_minutes.toFixed(1)} prior`
          : undefined,
    },
    {
      label: 'SAIFI',
      value: data.mtd.saifi != null ? data.mtd.saifi.toFixed(2) : '—',
      delta: data.delta.saifi_pct,
      invert: true,
      sub:
        data.prior_month.saifi != null ? `${data.prior_month.saifi.toFixed(2)} prior` : undefined,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {tiles.map((t) => (
          <DeltaTile key={t.label} {...t} />
        ))}
      </div>
      {data.total_customers_served > 0 ? (
        <p className="text-[11px] text-navy-600">
          Across {data.total_customers_served.toLocaleString()} customers served · MTD vs prior calendar month
        </p>
      ) : null}
    </div>
  );
}

function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

function KpiTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'warn' | 'bad';
}) {
  const valueClass =
    tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-red-400' : tone === 'warn' ? 'text-amber-400' : 'text-white';
  return (
    <div className="rounded-lg border border-navy-800 bg-navy-950/60 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-navy-600">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-navy-600">{sub}</div> : null}
    </div>
  );
}

function DeltaTile({
  label,
  value,
  delta,
  invert,
  sub,
}: {
  label: string;
  value: string;
  delta: number | null;
  invert?: boolean;
  sub?: string;
}) {
  let deltaTone: 'good' | 'bad' | 'flat' = 'flat';
  if (delta != null && Math.abs(delta) >= 0.5) {
    const isUp = delta > 0;
    if (invert) deltaTone = isUp ? 'bad' : 'good';
    else deltaTone = isUp ? 'good' : 'bad';
  }
  const deltaClass =
    deltaTone === 'good' ? 'text-emerald-400' : deltaTone === 'bad' ? 'text-red-400' : 'text-navy-600';
  const Arrow = delta != null && delta < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <div className="rounded-lg border border-navy-800 bg-navy-950/60 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-navy-600">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold text-white tabular-nums">{value}</span>
        {delta != null ? (
          <span className={`inline-flex items-center text-[11px] tabular-nums ${deltaClass}`}>
            <Arrow className="h-3 w-3" aria-hidden="true" />
            {Math.abs(delta).toFixed(0)}%
          </span>
        ) : null}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-navy-600">{sub}</div> : null}
    </div>
  );
}

const STATION_DOT: Record<StationHealthRow['status'], string> = {
  critical: 'bg-red-400',
  degraded: 'bg-amber-400',
  healthy: 'bg-emerald-500',
  unknown: 'bg-navy-700',
};

const STATION_TEXT: Record<StationHealthRow['status'], string> = {
  critical: 'text-red-400',
  degraded: 'text-amber-400',
  healthy: 'text-white',
  unknown: 'text-navy-600',
};

function stationBadge(stations: StationHealthRow[]):
  | { text: string; variant: 'default' | 'success' | 'warning' | 'danger' }
  | undefined {
  if (stations.length === 0) return undefined;
  let healthy = 0;
  let critical = 0;
  for (const s of stations) {
    if (s.status === 'healthy') healthy++;
    else if (s.status === 'critical') critical++;
  }
  return {
    text: `${healthy} of ${stations.length} healthy`,
    variant: critical > 0 ? 'danger' : healthy === stations.length ? 'success' : 'warning',
  };
}

function StationAvailabilityBody({ stations }: { stations: StationHealthRow[] }) {
  if (stations.length === 0) return <EmptyBody text="No station data" />;
  return (
    <ul className="divide-y divide-navy-800/60">
      {stations.map((st) => (
        <li key={st.station} className="flex items-center gap-3 py-2 text-sm">
          <span
            className={`inline-flex h-2.5 w-2.5 rounded-full shrink-0 ${STATION_DOT[st.status]}`}
            aria-label={`status ${st.status}`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-white truncate">{st.station}</p>
            <p className="text-[11px] text-navy-600">
              {st.total_available_mw != null ? st.total_available_mw.toFixed(1) : '—'} /
              {st.total_derated_capacity_mw != null
                ? ` ${st.total_derated_capacity_mw.toFixed(1)}`
                : ' —'}{' '}
              MW derated
            </p>
          </div>
          <span className={`text-xs tabular-nums ${STATION_TEXT[st.status]}`}>
            {st.pct_of_derated != null ? `${Math.round(st.pct_of_derated)}%` : '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}

function outageBadge(
  outages: RecentOutageRow[],
  mtd: number,
): { text: string; variant: 'default' | 'warning' | 'danger' } {
  if (mtd === 0) return { text: '0', variant: 'default' };
  const open = outages.filter((o) => o.status === 'open').length;
  return {
    text: open > 0 ? `${mtd} MTD · ${open} open` : `${mtd} MTD`,
    variant: open > 0 ? 'danger' : 'warning',
  };
}

function OutagesBody({ outages, mtd }: { outages: RecentOutageRow[]; mtd: number }) {
  if (outages.length === 0) return <EmptyBody text="No outages this month" />;
  return (
    <>
      <ul className="divide-y divide-navy-800/60">
        {outages.map((o) => (
          <li key={o.id} className="flex items-start gap-3 py-2">
            <span
              className={`mt-1 inline-flex h-2 w-2 rounded-full shrink-0 ${
                o.status === 'open' ? 'bg-red-400' : 'bg-navy-700'
              }`}
              aria-label={`status ${o.status ?? 'unknown'}`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">
                {o.feeder_code || o.substation_code || 'Outage'}
                {o.areas_affected ? <span className="text-navy-600"> · {o.areas_affected}</span> : null}
              </p>
              <p className="mt-0.5 text-[11px] text-navy-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {o.date ? (
                  <span>
                    {o.date}
                    {o.time_out ? ` ${o.time_out.slice(0, 5)}` : ''}
                  </span>
                ) : null}
                {o.duration_minutes != null ? <span>· {formatDuration(o.duration_minutes)}</span> : null}
                {o.customers_affected != null ? (
                  <span>· {o.customers_affected.toLocaleString()} customers</span>
                ) : null}
                {o.status ? <span className="uppercase">· {o.status}</span> : null}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {mtd > outages.length ? (
        <p className="pt-3 text-[11px] text-navy-600">
          Showing {outages.length} of {mtd} this month — open Grid Health for the full log.
        </p>
      ) : null}
    </>
  );
}

function EmptyBody({ text = 'No open items' }: { text?: string }) {
  return <p className="py-3 text-xs text-navy-600">{text}</p>;
}

function CardSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-4 rounded bg-navy-800/60" />
      <div className="h-4 rounded bg-navy-800/40 w-5/6" />
      <div className="h-4 rounded bg-navy-800/40 w-2/3" />
    </div>
  );
}
