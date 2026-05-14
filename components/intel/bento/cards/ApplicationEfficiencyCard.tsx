import Link from 'next/link';
import { Gauge } from 'lucide-react';
import type { ApplicationThroughput } from '@/lib/intel/get-agency-intel-data';
import { BentoCard, CardHead } from '@/components/intel/common';

interface ApplicationEfficiencyCardProps {
  data: ApplicationThroughput;
  href: string;
  methodologyHref?: string;
  className?: string;
}

export function ApplicationEfficiencyCard({
  data,
  href,
  methodologyHref,
  className,
}: ApplicationEfficiencyCardProps) {
  const tiles: Array<{ label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' }> = [
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
      value: data.approval_rate_pct != null ? `${Math.round(data.approval_rate_pct)}%` : '—',
    },
  ];

  return (
    <BentoCard className={className} ariaLabel="Application efficiency">
      <CardHead
        icon={<Gauge size={14} />}
        title="Application Efficiency"
        right={
          methodologyHref ? (
            <Link
              href={`${methodologyHref}#applications-throughput`}
              className="text-[11px] text-navy-600 hover:text-gold-500 underline-offset-2 hover:underline transition-colors"
            >
              How is this calculated?
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-2 flex-1">
        {tiles.map((t) => {
          const valueClass =
            t.tone === 'good'
              ? 'text-emerald-400'
              : t.tone === 'bad'
                ? 'text-red-400'
                : t.tone === 'warn'
                  ? 'text-amber-400'
                  : 'text-white';
          return (
            <div
              key={t.label}
              className="rounded-lg border border-navy-800 bg-navy-950/60 px-3 py-2"
            >
              <p className="text-[10px] uppercase tracking-wider text-navy-600">{t.label}</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${valueClass}`}>{t.value}</p>
              {t.sub ? <p className="text-[10px] text-navy-600">{t.sub}</p> : null}
            </div>
          );
        })}
      </div>

      <Link
        href={href}
        className="text-[11px] text-navy-600 hover:text-gold-500 transition-colors"
      >
        View detail →
      </Link>
    </BentoCard>
  );
}
