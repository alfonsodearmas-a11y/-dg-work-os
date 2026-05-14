import Link from 'next/link';
import { Plug } from 'lucide-react';
import type { GridReliability } from '@/lib/intel/get-agency-intel-data';
import { BentoCard, CardHead, DeltaTile, formatCompactNumber } from '@/components/intel/common';
import { formatSaidi, formatSaifi } from '@/lib/intel/agency-bento-data';

interface GridReliabilityCardProps {
  data: GridReliability;
  methodologyHref?: string;
  className?: string;
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

export function GridReliabilityCard({ data, methodologyHref, className }: GridReliabilityCardProps) {
  if (data.mtd.outage_count === 0 && data.prior_month.outage_count === 0) {
    return (
      <BentoCard className={className} ariaLabel="Grid reliability">
        <CardHead icon={<Plug size={14} />} title="Grid Reliability" />
        <p className="text-xs text-navy-600 italic">No outage data this month.</p>
        <p className="text-[11px] text-navy-600">{buildFooterText(data)}</p>
      </BentoCard>
    );
  }

  const tiles = [
    {
      label: 'Outages',
      value: data.mtd.outage_count.toLocaleString(),
      delta: data.delta.outage_count_pct,
      invert: true,
      sub: `${data.prior_month.outage_count.toLocaleString()} prior`,
    },
    {
      label: 'Customer-hours lost',
      value: formatCompactNumber(data.mtd.customer_hours_lost),
      delta: data.delta.customer_hours_lost_pct,
      invert: true,
      sub: `${formatCompactNumber(data.prior_month.customer_hours_lost)} prior`,
    },
    {
      label: 'SAIDI',
      value: formatSaidi(data.mtd.saidi_minutes),
      delta: data.delta.saidi_pct,
      invert: true,
      sub:
        data.prior_month.saidi_minutes != null
          ? `${formatSaidi(data.prior_month.saidi_minutes)} prior`
          : undefined,
    },
    {
      label: 'SAIFI',
      value: formatSaifi(data.mtd.saifi),
      delta: data.delta.saifi_pct,
      invert: true,
      sub:
        data.prior_month.saifi != null
          ? `${formatSaifi(data.prior_month.saifi)} prior`
          : undefined,
    },
  ];

  return (
    <BentoCard className={className} ariaLabel="Grid reliability">
      <CardHead
        icon={<Plug size={14} />}
        title="Grid Reliability"
        right={
          methodologyHref ? (
            <Link
              href={`${methodologyHref}#grid-reliability`}
              className="text-[11px] text-navy-600 hover:text-gold-500 underline-offset-2 hover:underline transition-colors"
            >
              How is this calculated?
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-2.5 flex-1">
        {tiles.map((t) => (
          <DeltaTile key={t.label} {...t} />
        ))}
      </div>

      <p className="text-[11px] text-navy-600 leading-relaxed">{buildFooterText(data)}</p>
    </BentoCard>
  );
}
