import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { TODAY_THRESHOLDS } from '@/lib/today/thresholds';

export const dynamic = 'force-dynamic';

interface FeederSummary {
  feeder_count: number;
  total_customers: number;
  last_sync: string | null;
  days_stale: number | null;
}

async function getFeederSummary(): Promise<FeederSummary> {
  const { data, error } = await supabaseAdmin
    .from('gpl_feeder_cache')
    .select('customer_count, synced_at');
  if (error) {
    return { feeder_count: 0, total_customers: 0, last_sync: null, days_stale: null };
  }
  const rows = (data ?? []) as Array<{ customer_count: number | null; synced_at: string | null }>;
  let total = 0;
  let lastSync: string | null = null;
  for (const r of rows) {
    total += Number(r.customer_count) || 0;
    if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
  }
  const daysStale = lastSync
    ? Math.floor((Date.now() - new Date(lastSync).getTime()) / 86_400_000)
    : null;
  return {
    feeder_count: rows.length,
    total_customers: total,
    last_sync: lastSync,
    days_stale: daysStale,
  };
}

function formatComparatorLabel(now: Date): string {
  const todayDay = now.getUTCDate();
  const priorMonth0 = now.getUTCMonth() - 1;
  const priorYear = priorMonth0 < 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const priorMonth = priorMonth0 < 0 ? 11 : priorMonth0;
  const priorMonthLastDay = new Date(Date.UTC(priorYear, priorMonth + 1, 0)).getUTCDate();
  const monthName = new Date(Date.UTC(priorYear, priorMonth, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  return todayDay > priorMonthLastDay
    ? `${monthName} 1 to ${priorMonthLastDay} (clamped)`
    : `${monthName} 1 to ${todayDay}`;
}

export default async function GPLMethodologyPage() {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) notFound();
  const { session } = result;
  if (!canAccessAgency(session.user.role, session.user.agency, 'GPL')) notFound();

  const summary = await getFeederSummary();
  const comparatorLabel = formatComparatorLabel(new Date());
  const stageSla = TODAY_THRESHOLDS.tender_sla.stage_sla_days;

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      <header className="space-y-3">
        <Link
          href="/intel/gpl"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-navy-600 hover:text-gold-500 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          GPL deep dive
        </Link>
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold-500/80">
          Methodology
        </p>
        <h1 className="text-3xl font-semibold text-white tracking-tight">
          How GPL bento metrics are calculated
        </h1>
        <p className="text-sm text-navy-600 leading-relaxed">
          Each module on the GPL deep dive draws from a specific table or
          query. This page documents the source, formula, comparator window,
          and known caveats so anyone reading the dashboard can probe a number
          they doubt.
        </p>
      </header>

      <Section
        id="grid-reliability"
        title="Grid Reliability (SAIDI, SAIFI, Customer-hours, Outages)"
      >
        <p>
          Source tables: <Code>gpl_outage_cache</Code> for outage events,
          <Code>gpl_feeder_cache</Code> for the system-wide customer count.
        </p>

        <Subhead>Formula</Subhead>
        <pre className="text-xs bg-navy-950/60 border border-navy-800 rounded-lg p-3 overflow-x-auto">
{`for each outage in [period_start, period_end]:
  customer_minutes += customers_affected * duration_minutes
  customer_count   += customers_affected
  count            += 1

total_customers = SUM(customer_count) FROM gpl_feeder_cache

SAIDI (min/customer) = customer_minutes / total_customers
SAIFI (events/customer) = customer_count / total_customers
Customer-hours lost = customer_minutes / 60
Outages = count`}
        </pre>
        <p className="text-xs text-navy-600">
          IEEE 1366 standard definitions. SAIDI and SAIFI return null and
          render as &mdash; when <Code>total_customers</Code> is zero. No
          fallback or proxy formula.
        </p>

        <Subhead>Current denominator (live)</Subhead>
        <ul className="text-sm space-y-1">
          <li>
            <span className="text-navy-600">Total customers served:</span>{' '}
            <span className="text-white tabular-nums">
              {summary.total_customers.toLocaleString()}
            </span>
          </li>
          <li>
            <span className="text-navy-600">Feeder count:</span>{' '}
            <span className="text-white tabular-nums">{summary.feeder_count}</span>
          </li>
          <li>
            <span className="text-navy-600">Last feeder cache sync:</span>{' '}
            <span className="text-white">
              {summary.last_sync
                ? new Date(summary.last_sync).toUTCString()
                : 'never synced'}
              {summary.days_stale != null && summary.days_stale > 0
                ? ` (${summary.days_stale}d ago)`
                : null}
            </span>
          </li>
        </ul>

        <Subhead>Comparator window</Subhead>
        <p>
          MTD vs same-day-of-month range in the prior calendar month.
          Today&rsquo;s comparator window: <Strong>{comparatorLabel}</Strong>.
        </p>
        <p className="text-xs text-navy-600">
          When today&rsquo;s day-of-month exceeds the prior month&rsquo;s
          length (March 31 vs February), the comparator is clamped to the
          last day of the prior month and the label honestly indicates
          clamping.
        </p>

        <Subhead>Caveats</Subhead>
        <ul className="text-xs text-navy-600 space-y-1 list-disc list-inside">
          <li>
            Per-feeder <Code>customer_count</Code> reflects the upstream GPL
            System Control Dashboard at last sync. If GPL refreshes those
            numbers infrequently, the denominator may lag actual connections.
          </li>
          <li>
            <Code>gpl_outage_cache</Code> is populated by manual sync from the
            same upstream. Missing outages translate directly into understated
            metrics.
          </li>
          <li>
            Outage duration uses <Code>duration_minutes</Code> from the cache,
            which captures wall-clock minutes for the event. Partial-restoration
            scenarios are not modeled separately.
          </li>
        </ul>
      </Section>

      <Section id="pending-applications" title="Pending Service Applications">
        <p>
          Source table: <Code>customer_applications</Code> filtered to{' '}
          <Code>agency = &lsquo;GPL&rsquo;</Code> and status in{' '}
          <Code>(pending, under_review)</Code>.
        </p>
        <Subhead>Formula</Subhead>
        <pre className="text-xs bg-navy-950/60 border border-navy-800 rounded-lg p-3 overflow-x-auto">
{`SELECT status, submitted_at
FROM customer_applications
WHERE agency ILIKE 'GPL'
  AND status IN ('pending', 'under_review');

aging buckets:
  0_30     = COUNT(WHERE age <= 30)
  31_60    = COUNT(WHERE 30 < age <= 60)
  61_90    = COUNT(WHERE 60 < age <= 90)
  90_plus  = COUNT(WHERE age > 90)
oldest_days = MAX(age)`}
        </pre>
        <p className="text-xs text-navy-600">
          Note: the standalone{' '}
          <Link href="/intel/pending-applications" className="text-gold-500 underline-offset-2 hover:underline">
            /intel/pending-applications
          </Link>{' '}
          page reads from a different table, <Code>pending_applications</Code>.
          The two sources are not synchronized; this card uses the historic
          <Code>customer_applications</Code> source.
        </p>
      </Section>

      <Section id="applications-throughput" title="Application Efficiency">
        <p>
          Source table: <Code>customer_applications</Code> filtered to{' '}
          <Code>agency = &lsquo;GPL&rsquo;</Code>. Rolling 30-day window
          ending today.
        </p>
        <Subhead>Tile formulas</Subhead>
        <ul className="text-sm space-y-1.5">
          <li>
            <Strong>Closed (30d)</Strong>: count of rows where{' '}
            <Code>status</Code> is <Code>approved</Code> or{' '}
            <Code>rejected</Code> AND <Code>updated_at</Code> falls within the
            last 30 days.
          </li>
          <li>
            <Strong>New (30d)</Strong>: count of rows where{' '}
            <Code>submitted_at</Code> falls within the last 30 days.
          </li>
          <li>
            <Strong>Avg time to close</Strong>: mean of{' '}
            <Code>(updated_at - submitted_at)</Code> in days, computed only
            over the closed_30d set. Returns &mdash; when zero rows.
          </li>
          <li>
            <Strong>Backlog change</Strong>:{' '}
            <Code>backlog_now - backlog_30d_ago</Code>. backlog_now =
            currently-open rows. backlog_30d_ago = rows submitted before the
            30-day cutoff that are either still open or were closed only after
            the cutoff.
          </li>
          <li>
            <Strong>Approval rate</Strong>: percent of closed_30d set with{' '}
            <Code>status = &lsquo;approved&rsquo;</Code>.
          </li>
        </ul>
      </Section>

      <Section id="station-availability" title="Station Availability">
        <p>
          Source table: <Code>gpl_daily_stations</Code>. The query selects the
          most recent <Code>report_date</Code> per <Code>station</Code> and
          classifies each by the ratio of available MW to derated capacity.
        </p>
        <Subhead>Classification thresholds</Subhead>
        <ul className="text-sm space-y-1">
          <li>
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle mr-2" />
            <Strong>Healthy</Strong>: available_mw / derated_mw &ge; 80%
          </li>
          <li>
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400 align-middle mr-2" />
            <Strong>Degraded</Strong>: 50% &le; ratio &lt; 80%
          </li>
          <li>
            <span className="inline-block h-2 w-2 rounded-full bg-red-400 align-middle mr-2" />
            <Strong>Critical</Strong>: ratio &lt; 50%
          </li>
          <li>
            <span className="inline-block h-2 w-2 rounded-full bg-navy-700 align-middle mr-2" />
            <Strong>Unknown</Strong>: missing capacity data
          </li>
        </ul>
        <p className="text-xs text-navy-600">
          Defined in <Code>lib/gpl/derated.ts::classifyStation</Code>. The DBIS
          daily upload at <Code>/intel/gpl/dbis</Code> is the data source for
          this table.
        </p>
      </Section>

      <Section id="delayed-projects" title="Delayed Projects (worst Xd)">
        <p>
          Source table: <Code>delayed_projects</Code> filtered to{' '}
          <Code>sub_agency = &lsquo;GPL&rsquo;</Code>. The card header reads{' '}
          <Strong>10 · worst 701d</Strong> where the count is the total
          number of delayed projects and <Strong>worst Xd</Strong> is{' '}
          <Code>MAX(CURRENT_DATE - project_end_date)</Code> across that set,
          not the sum of all individual delays.
        </p>
        <p className="text-xs text-navy-600">
          Summing per-project days-overdue across an agency makes a number
          that&rsquo;s arithmetically real but semantically meaningless. We
          report the worst-offender so the DG can ask one specific question
          (&ldquo;what about the 701-day project?&rdquo;) instead of staring
          at a sum that could be 10 mild slips or 1 catastrophic one.
        </p>
      </Section>

      <Section id="tender-sla" title="Tender SLA stages (Critical Procurement, Tenders in Evaluation)">
        <p>
          Source table: <Code>tender</Code> in Supabase. SLA thresholds are
          centralized in <Code>lib/today/thresholds.ts</Code>.
        </p>
        <Subhead>Stage SLAs (days)</Subhead>
        <ul className="text-sm space-y-1">
          <li>
            <Strong>Advertised:</Strong>{' '}
            <span className="tabular-nums">{stageSla.advertised}</span> days
          </li>
          <li>
            <Strong>Evaluation:</Strong>{' '}
            <span className="tabular-nums">{stageSla.evaluation}</span> days
          </li>
          <li>
            <Strong>Awaiting award:</Strong>{' '}
            <span className="tabular-nums">{stageSla.awaiting_award}</span> days
          </li>
          <li className="text-navy-600 text-xs">
            Design and award stages have no SLA (pre-advertised and terminal).
          </li>
        </ul>
        <p className="text-xs text-navy-600">
          Days-in-stage is computed strictly from PSIP date columns
          (<Code>date_advertised</Code>, <Code>date_closed</Code>,{' '}
          <Code>date_eval_sent_nptab</Code>). Rollover and exception flagged
          tenders are excluded from breach counts.
        </p>
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-20">
      <h2 className="text-xl font-semibold text-white border-b border-navy-800 pb-2">{title}</h2>
      <div className="space-y-3 text-sm text-slate-300 leading-relaxed">{children}</div>
    </section>
  );
}

function Subhead({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] uppercase tracking-[0.14em] text-gold-500 mt-4">{children}</h3>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[12px] px-1 py-0.5 rounded bg-navy-900 border border-navy-800 text-slate-200">
      {children}
    </code>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="text-white font-semibold">{children}</span>;
}
