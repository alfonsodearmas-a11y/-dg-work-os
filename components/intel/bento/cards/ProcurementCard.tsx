import Link from 'next/link';
import { Briefcase } from 'lucide-react';
import type { CriticalTenderRow } from '@/lib/procurement/queries';
import { BentoCard, CardHead } from '@/components/intel/common';

const PREVIEW_COUNT = 4;

const REASON_LABEL: Record<CriticalTenderRow['reason'], string> = {
  missing_pending_decision: 'pending decision',
  missing_from_upload: 'missing from upload',
  stale_award: 'stale award',
};

interface ProcurementCardProps {
  items: CriticalTenderRow[];
  href: string;
  className?: string;
  accent?: string;
}

export function ProcurementCard({ items, href, className, accent }: ProcurementCardProps) {
  const total = items.length;
  const preview = items.slice(0, PREVIEW_COUNT);

  return (
    <BentoCard className={className} ariaLabel={`Critical procurement: ${total}`}>
      <CardHead
        icon={<Briefcase size={14} />}
        iconAccent={accent}
        title="Critical Procurement"
        right={
          <span className="text-[11px] tabular-nums text-white">{total}</span>
        }
      />

      {total === 0 ? (
        <p className="text-xs text-navy-600 italic">No critical tenders.</p>
      ) : (
        <ul className="space-y-2 flex-1 min-h-0">
          {preview.map((t) => (
            <li key={t.id} className="flex items-start gap-2.5 min-w-0">
              <span
                className="mt-1.5 inline-flex h-2 w-2 rounded-full shrink-0 bg-amber-400"
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate leading-snug">{t.description}</p>
                <p className="text-[11px] text-navy-600">
                  <span className="uppercase">{t.stage.replace(/_/g, ' ')}</span>
                  <span> · {REASON_LABEL[t.reason]}</span>
                  {t.days_in_stage != null ? <span> · {t.days_in_stage}d in stage</span> : null}
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
        View all →
      </Link>
    </BentoCard>
  );
}
