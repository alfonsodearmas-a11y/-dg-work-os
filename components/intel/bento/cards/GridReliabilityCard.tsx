import Link from 'next/link';
import { Plug } from 'lucide-react';
import type {
  GridReliability,
  OutageAggregates,
} from '@/lib/intel/get-agency-intel-data';
import { BentoCard, CardHead, formatCompactNumber } from '@/components/intel/common';

interface GridReliabilityCardProps {
  data: GridReliability;
  aggregates: OutageAggregates;
  methodologyHref?: string;
  className?: string;
  accent?: string;
}

const STALE_THRESHOLD_DAYS = 14;

function buildFooterText(data: GridReliability): string {
  const customerCount = data.total_customers_served.toLocaleString();
  const feederSegment = data.feeder_count > 0 ? `${data.feeder_count} feeders` : 'no feeders';
  const sync = data.feeder_last_sync
    ? data.feeder_days_stale === 0
      ? 'synced today'
      : data.feeder_days_stale === 1
        ? 'synced yesterday'
        : `synced ${data.feeder_days_stale}d ago`
    : 'never synced';
  let text = `Across ${customerCount} customers served (${feederSegment}, ${sync}) · ${data.comparator_label}`;
  if (data.feeder_days_stale != null && data.feeder_days_stale > STALE_THRESHOLD_DAYS) {
    text += ` · feeder data ${data.feeder_days_stale}d stale`;
  }
  return text;
}

export function GridReliabilityCard({
  data,
  aggregates,
  methodologyHref,
  className,
  accent,
}: GridReliabilityCardProps) {
  if (data.mtd.outage_count === 0 && data.prior_month.outage_count === 0) {
    return (
      <BentoCard className={className} ariaLabel="Grid reliability" accent={accent}>
        <CardHead icon={<Plug size={14} />} title="Grid Reliability" />
        <p className="text-xs text-navy-600 italic">No outage data this month.</p>
        <p className="text-[11px] text-navy-600">{buildFooterText(data)}</p>
      </BentoCard>
    );
  }

  return (
    <BentoCard className={className} ariaLabel="Grid reliability" accent={accent}>
      <CardHead
        icon={<Plug size={14} />}
        title="Grid Reliability"
        right={
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.05] text-[10px] uppercase tracking-wider text-navy-600">
            {data.comparator_label.replace(/^vs\s+/, '')}
          </span>
        }
      />

      <div className="grid grid-cols-3 gap-x-6 gap-y-2 pt-1">
        <BigStat
          label="SAIDI"
          value={data.mtd.saidi_minutes != null ? data.mtd.saidi_minutes.toFixed(1) : '—'}
          unit={data.mtd.saidi_minutes != null ? 'min' : undefined}
          deltaPct={data.delta.saidi_pct}
          invert
          tone={
            data.delta.saidi_pct != null && data.delta.saidi_pct > 0
              ? 'warn'
              : undefined
          }
        />
        <BigStat
          label="SAIFI"
          value={data.mtd.saifi != null ? data.mtd.saifi.toFixed(2) : '—'}
          unit={data.mtd.saifi != null ? 'events' : undefined}
          deltaPct={data.delta.saifi_pct}
          invert
        />
        <BigStat
          label="Customer-hours"
          value={formatCompactNumber(data.mtd.customer_hours_lost)}
          deltaPct={data.delta.customer_hours_lost_pct}
          invert
          tone={
            data.delta.customer_hours_lost_pct != null &&
            data.delta.customer_hours_lost_pct > 0
              ? 'danger'
              : undefined
          }
        />
      </div>

      <DailyOutageTimeline data={aggregates} accent={accent} />

      <TopFeedersBars
        feeders={aggregates.top_feeders}
        accent={accent}
      />

      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[11px] text-navy-600 leading-relaxed truncate">
          {buildFooterText(data)}
        </p>
        {methodologyHref ? (
          <Link
            href={`${methodologyHref}#grid-reliability`}
            className="text-[11px] text-navy-600 hover:text-gold-500 underline-offset-2 hover:underline transition-colors shrink-0"
          >
            How is this calculated?
          </Link>
        ) : null}
      </div>
    </BentoCard>
  );
}

function BigStat({
  label,
  value,
  unit,
  deltaPct,
  invert,
  tone,
}: {
  label: string;
  value: string;
  // Short unit suffix rendered baseline-aligned with the big number ("hrs",
  // "min", "events", "k"). Kept terse — the bento column is narrow.
  unit?: string;
  deltaPct: number | null;
  // If true, a positive delta (more outages, longer SAIDI) is bad. The arrow
  // color flips so "up" reads red.
  invert?: boolean;
  tone?: 'warn' | 'danger';
}) {
  const valueClass =
    tone === 'danger' ? 'text-red-400' : tone === 'warn' ? 'text-amber-400' : 'text-white';
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-navy-600">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span
          className={`text-[40px] leading-none font-semibold tracking-[-0.035em] tabular-nums ${valueClass}`}
        >
          {value}
        </span>
        {unit ? (
          <span className="text-[13px] font-medium text-navy-600 truncate">{unit}</span>
        ) : null}
      </div>
      <DeltaSub deltaPct={deltaPct} invert={invert ?? false} />
    </div>
  );
}

function DeltaSub({ deltaPct, invert }: { deltaPct: number | null; invert: boolean }) {
  if (deltaPct == null) {
    return <span className="text-[11px] text-navy-600 font-mono">—</span>;
  }
  const up = deltaPct > 0;
  const badDirection = invert ? up : !up;
  const cls = deltaPct === 0
    ? 'text-navy-600'
    : badDirection
      ? 'text-red-400'
      : 'text-emerald-400';
  const arrow = deltaPct === 0 ? '·' : up ? '▲' : '▼';
  return (
    <span className={`text-[11px] font-mono tabular-nums ${cls}`}>
      {arrow} {Math.abs(deltaPct).toFixed(0)}%
    </span>
  );
}

// 30-day daily outage timeline. Each day is one flex-grow bar; height scales
// to the max-count day. Bars tint warn/danger by intensity quartile so the
// painting picks up spikes without needing axis labels on every tick.
function DailyOutageTimeline({
  data,
  accent,
}: {
  data: OutageAggregates;
  accent?: string;
}) {
  const max = data.daily_30d.reduce((m, d) => Math.max(m, d.outage_count), 0);
  const safeMax = max === 0 ? 1 : max;
  const fallbackAccent = accent ?? '#E8B83A';

  const startLabel = labelDate(data.window_start);
  const endLabel = labelDate(data.window_end);

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-navy-600">
          Daily outages · 30 days
        </span>
        <span className="text-[10px] font-mono text-navy-600">
          {startLabel} → {endLabel}
        </span>
      </div>
      <div className="flex items-end gap-[3px] h-[48px]" aria-hidden="true">
        {data.daily_30d.map((d, i) => {
          const ratio = d.outage_count / safeMax;
          const heightPct = Math.max(2, Math.round(ratio * 100));
          const intensity = ratio;
          const color =
            intensity >= 0.66
              ? '#FF6B6B'
              : intensity >= 0.33
                ? '#FF9C5C'
                : fallbackAccent;
          return (
            <span
              key={d.date}
              className="flex-1 rounded-[2px] min-w-[3px]"
              style={{
                height: `${heightPct}%`,
                background: color,
                opacity: max === 0 ? 0.25 : 0.85,
              }}
              title={`${d.date} · ${d.outage_count} outage${d.outage_count === 1 ? '' : 's'}`}
              data-day={i}
            />
          );
        })}
      </div>
    </div>
  );
}

// Top-feeders breakdown. Bars are agency-accent gradients, value rendered as
// compact customer-hours (k / M). Falls back to a quiet "no feeder data" line
// when the 30-day window has no outages keyed to a feeder.
function TopFeedersBars({
  feeders,
  accent,
}: {
  feeders: OutageAggregates['top_feeders'];
  accent?: string;
}) {
  if (feeders.length === 0) {
    return (
      <div className="pt-2 border-t border-white/[0.06]">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-navy-600">
          Top feeders by customer-hours
        </span>
        <p className="text-[11px] text-navy-600 italic mt-1">
          No feeder-level outage data in this window.
        </p>
      </div>
    );
  }

  const max = feeders.reduce((m, f) => Math.max(m, f.customer_hours), 0);
  const safeMax = max === 0 ? 1 : max;
  const fallbackAccent = accent ?? '#E8B83A';

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-navy-600">
        Top feeders by customer-hours
      </span>
      <ul className="flex flex-col gap-2">
        {feeders.map((f) => {
          const pct = (f.customer_hours / safeMax) * 100;
          return (
            <li key={f.feeder_code} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 min-w-0">
                <span className="text-[12.5px] font-medium text-white truncate">
                  {f.feeder_code}
                </span>
                <span className="text-[11.5px] font-mono text-navy-600 tabular-nums shrink-0">
                  {formatCompactNumber(f.customer_hours)} hrs
                </span>
              </div>
              <div className="h-[6px] rounded-full bg-white/[0.06] overflow-hidden">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(2, pct)}%`,
                    background: `linear-gradient(90deg, ${fallbackAccent}, ${fallbackAccent}cc)`,
                  }}
                  aria-hidden="true"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function labelDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`;
}
