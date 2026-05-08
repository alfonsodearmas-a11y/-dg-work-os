import Link from 'next/link';
import { FileText } from 'lucide-react';
import type { AgencyOutstandingApplications } from '@/lib/intel/get-agency-intel-data';
import { BentoCard, CardHead } from '@/components/intel/common';

interface PendingApplicationsCardProps {
  data: AgencyOutstandingApplications;
  href: string;
  methodologyHref?: string;
  className?: string;
}

export function PendingApplicationsCard({
  data,
  href,
  methodologyHref,
  className,
}: PendingApplicationsCardProps) {
  const has90Plus = (data.by_age_bucket['90_plus'] ?? 0) > 0;

  const buckets: Array<{ label: string; key: keyof typeof data.by_age_bucket; emphasize?: boolean }> = [
    { label: '0–30d', key: '0_30' },
    { label: '31–60d', key: '31_60' },
    { label: '61–90d', key: '61_90' },
    { label: '90+d', key: '90_plus', emphasize: has90Plus },
  ];

  return (
    <BentoCard className={className} ariaLabel={`Pending service applications: ${data.total}`}>
      <CardHead
        icon={<FileText size={14} />}
        title="Pending Service Applications"
        right={
          <span className="text-[11px] tabular-nums">
            {data.oldest_days != null ? (
              <>
                <span className={has90Plus ? 'text-red-400 font-semibold' : 'text-amber-400 font-semibold'}>
                  {data.oldest_days}d
                </span>
                <span className="text-navy-600"> oldest · </span>
              </>
            ) : null}
            <span className="text-white">{data.total}</span>
          </span>
        }
      />

      {data.total === 0 ? (
        <p className="text-xs text-navy-600 italic">No pending applications.</p>
      ) : (
        <div className="grid grid-cols-4 gap-2 flex-1">
          {buckets.map((b) => (
            <div
              key={b.key}
              className="rounded-lg border border-navy-800 bg-navy-950/60 px-2 py-2 text-center"
            >
              <p className={`text-[10px] uppercase tracking-wider ${b.emphasize ? 'text-red-400' : 'text-navy-600'}`}>
                {b.label}
              </p>
              <p
                className={`mt-1 text-lg font-semibold tabular-nums ${
                  b.emphasize ? 'text-red-400' : 'text-white'
                }`}
              >
                {data.by_age_bucket[b.key]}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Link
          href={href}
          className="text-[11px] text-navy-600 hover:text-gold-500 transition-colors"
        >
          View all →
        </Link>
        {methodologyHref ? (
          <Link
            href={`${methodologyHref}#pending-applications`}
            className="text-[11px] text-navy-600 hover:text-gold-500 underline-offset-2 hover:underline transition-colors"
          >
            How is this calculated?
          </Link>
        ) : null}
      </div>
    </BentoCard>
  );
}
