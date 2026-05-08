import Link from 'next/link';
import { Activity } from 'lucide-react';
import type { RecentOutageRow } from '@/lib/intel/get-agency-intel-data';
import { BentoCard, CardHead } from '@/components/intel/common';
import { formatDuration } from '@/lib/calendar-utils';

const PREVIEW_COUNT = 6;

interface OutagesCardProps {
  items: RecentOutageRow[];
  mtd: number;
  href: string;
  className?: string;
}

export function OutagesCard({ items, mtd, href, className }: OutagesCardProps) {
  const open = items.filter((o) => o.status === 'open').length;
  const preview = items.slice(0, PREVIEW_COUNT);

  return (
    <BentoCard className={className} ariaLabel={`Outages this month: ${mtd}`}>
      <CardHead
        icon={<Activity size={14} />}
        title="Outages"
        right={
          <span className="text-[11px] tabular-nums">
            {open > 0 ? (
              <>
                <span className="text-red-400 font-semibold">{open}</span>
                <span className="text-navy-600"> open · </span>
              </>
            ) : null}
            <span className="text-white">{mtd} MTD</span>
          </span>
        }
      />

      {items.length === 0 ? (
        <p className="text-xs text-navy-600 italic">No outages this month.</p>
      ) : (
        <ul className="space-y-2 flex-1 min-h-0 overflow-hidden">
          {preview.map((o) => (
            <li key={o.id} className="flex items-start gap-2.5 min-w-0">
              <span
                className={`mt-1.5 inline-flex h-2 w-2 rounded-full shrink-0 ${
                  o.status === 'open' ? 'bg-red-400' : 'bg-navy-700'
                }`}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate leading-snug">
                  {o.feeder_code || o.substation_code || 'Outage'}
                  {o.areas_affected ? (
                    <span className="text-navy-600"> · {o.areas_affected}</span>
                  ) : null}
                </p>
                <p className="text-[11px] text-navy-600">
                  {o.date ? <span>{o.date}{o.time_out ? ` ${o.time_out.slice(0, 5)}` : ''}</span> : null}
                  {o.duration_minutes != null ? (
                    <span> · {formatDuration(o.duration_minutes)}</span>
                  ) : null}
                  {o.customers_affected != null ? (
                    <span> · {o.customers_affected.toLocaleString()} customers</span>
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
        {mtd > preview.length ? `View all ${mtd} →` : 'Open Grid Health →'}
      </Link>
    </BentoCard>
  );
}
