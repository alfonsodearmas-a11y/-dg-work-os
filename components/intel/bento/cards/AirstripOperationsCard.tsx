import Link from 'next/link';
import { PlaneLanding } from 'lucide-react';
import type { HasAirstripOps } from '@/lib/intel/get-agency-intel-data';
import { BentoCard, CardHead } from '@/components/intel/common';

const PREVIEW_COUNT = 4;

const CONDITION_TEXT: Record<string, string> = {
  Good: 'text-emerald-400',
  Satisfactory: 'text-amber-400',
  Poor: 'text-red-400',
};

interface AirstripOperationsCardProps {
  data: HasAirstripOps;
  href: string;
  className?: string;
  accent?: string;
}

export function AirstripOperationsCard({
  data,
  href,
  className,
  accent,
}: AirstripOperationsCardProps) {
  if (data.total === 0) {
    return (
      <BentoCard className={className} ariaLabel="Airstrip operations">
        <CardHead icon={<PlaneLanding size={14} />} iconAccent={accent} title="Airstrip Operations" />
        <p className="text-xs text-navy-600 italic">No airstrip data.</p>
      </BentoCard>
    );
  }

  const tiles = [
    { label: 'Operational', value: data.operational, tone: 'good' as const },
    { label: 'Limited / rehab', value: data.limited_or_rehab, tone: data.limited_or_rehab > 0 ? ('warn' as const) : undefined },
    {
      label: 'Overdue inspection',
      value: data.overdue_inspection,
      sub: `of ${data.total}`,
      tone: data.overdue_inspection > 0 ? ('bad' as const) : undefined,
    },
    {
      label: 'Pending verification',
      value: data.pending_verification,
      tone: data.pending_verification > 0 ? ('warn' as const) : undefined,
    },
  ];

  const overduePreview = data.overdue.slice(0, PREVIEW_COUNT);

  return (
    <BentoCard className={className} ariaLabel="Airstrip operations">
      <CardHead
        icon={<PlaneLanding size={14} />}
        iconAccent={accent}
        title="Airstrip Operations"
        right={
          <span className="text-[11px] tabular-nums">
            <span className={data.overdue_inspection > 0 ? 'text-red-400 font-semibold' : 'text-white font-semibold'}>
              {data.overdue_inspection}
            </span>
            <span className="text-navy-600">/{data.total} overdue</span>
          </span>
        }
      />

      <div className="grid grid-cols-4 gap-2">
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
              className="rounded-lg border border-navy-800 bg-navy-950/60 px-2 py-2 text-center"
            >
              <p className="text-[10px] uppercase tracking-wider text-navy-600">{t.label}</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${valueClass}`}>{t.value}</p>
              {t.sub ? <p className="text-[10px] text-navy-600">{t.sub}</p> : null}
            </div>
          );
        })}
      </div>

      {overduePreview.length > 0 && (
        <ul className="space-y-2 flex-1 min-h-0 overflow-hidden">
          {overduePreview.map((a) => (
            <li key={a.id} className="flex items-start gap-2.5 min-w-0">
              <span
                className={`mt-1.5 inline-flex h-2 w-2 rounded-full shrink-0 ${
                  a.last_inspection_date == null
                    ? 'bg-red-400'
                    : (a.days_since_inspection ?? 0) > 365
                      ? 'bg-red-400'
                      : 'bg-amber-400'
                }`}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate leading-snug">{a.name}</p>
                <p className="text-[11px] text-navy-600">
                  Region {a.region}
                  <span> · </span>
                  {a.last_inspection_date == null
                    ? 'Never inspected'
                    : `${a.days_since_inspection ?? 0}d since last`}
                  {a.surface_condition ? (
                    <span className={CONDITION_TEXT[a.surface_condition] ?? 'text-navy-600'}>
                      {' '}
                      · {a.surface_condition}
                    </span>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={href}
        className="text-[11px] text-navy-600 hover:text-gold-500 transition-colors"
      >
        Open Airstrips →
      </Link>
    </BentoCard>
  );
}
