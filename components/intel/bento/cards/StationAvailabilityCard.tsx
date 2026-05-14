import Link from 'next/link';
import { Gauge } from 'lucide-react';
import type { StationHealthRow } from '@/lib/intel/get-agency-intel-data';
import { BentoCard, CardHead } from '@/components/intel/common';

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

interface StationAvailabilityCardProps {
  stations: StationHealthRow[];
  href: string;
  methodologyHref?: string;
  className?: string;
}

export function StationAvailabilityCard({
  stations,
  href,
  methodologyHref,
  className,
}: StationAvailabilityCardProps) {
  const healthy = stations.filter((s) => s.status === 'healthy').length;
  const critical = stations.filter((s) => s.status === 'critical').length;

  return (
    <BentoCard className={className} ariaLabel="Station availability">
      <CardHead
        icon={<Gauge size={14} />}
        title="Station Availability"
        right={
          <span className="text-[11px] tabular-nums">
            {critical > 0 ? (
              <>
                <span className="text-red-400 font-semibold">{critical}</span>
                <span className="text-navy-600"> critical · </span>
              </>
            ) : null}
            <span className="text-white">
              {healthy}/{stations.length} healthy
            </span>
          </span>
        }
      />

      {stations.length === 0 ? (
        <p className="text-xs text-navy-600 italic">No station data.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 flex-1 min-h-0">
          {stations.map((st) => (
            <li key={st.station} className="flex items-center gap-2 min-w-0 text-xs">
              <span
                className={`inline-flex h-2 w-2 rounded-full shrink-0 ${STATION_DOT[st.status]}`}
                aria-hidden="true"
              />
              <span className="text-white truncate flex-1">{st.station}</span>
              <span className={`tabular-nums ${STATION_TEXT[st.status]}`}>
                {st.pct_of_derated != null ? `${Math.round(st.pct_of_derated)}%` : '—'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2">
        <Link
          href={href}
          className="text-[11px] text-navy-600 hover:text-gold-500 transition-colors"
        >
          DBIS detail →
        </Link>
        {methodologyHref ? (
          <Link
            href={`${methodologyHref}#station-availability`}
            className="text-[11px] text-navy-600 hover:text-gold-500 underline-offset-2 hover:underline transition-colors"
          >
            How is this calculated?
          </Link>
        ) : null}
      </div>
    </BentoCard>
  );
}
