import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { EVAL_DANGER_DAYS, EVAL_WARN_DAYS, type EvaluationTenderRow } from '@/lib/procurement/queries';
import { BentoCard, CardHead } from '@/components/intel/common';

const PREVIEW_COUNT = 4;

function dotClass(days: number | null): string {
  if (days == null) return 'bg-navy-700';
  if (days > EVAL_DANGER_DAYS) return 'bg-red-400';
  if (days > EVAL_WARN_DAYS) return 'bg-amber-400';
  return 'bg-emerald-500';
}

interface TendersInEvalCardProps {
  items: EvaluationTenderRow[];
  href: string;
  className?: string;
  accent?: string;
}

export function TendersInEvalCard({ items, href, className, accent }: TendersInEvalCardProps) {
  const total = items.length;
  const preview = items.slice(0, PREVIEW_COUNT);
  const oldest = items.reduce((m, r) => Math.max(m, r.days_in_stage ?? 0), 0);

  return (
    <BentoCard className={className} ariaLabel={`Tenders: ${total} in evaluation`}>
      <CardHead
        icon={<ClipboardCheck size={14} />}
        iconAccent={accent}
        title="Tenders"
        right={
          <span className="text-[11px] tabular-nums">
            <span className="text-white font-semibold">{total}</span>
            {oldest > 0 ? (
              <span className="text-navy-600"> · oldest {oldest}d</span>
            ) : null}
          </span>
        }
      />

      {total === 0 ? (
        <p className="text-xs text-navy-600 italic">No tenders awaiting evaluation.</p>
      ) : (
        <ul className="space-y-2 flex-1 min-h-0">
          {preview.map((t) => (
            <li key={t.id} className="flex items-start gap-2.5 min-w-0">
              <span
                className={`mt-1.5 inline-flex h-2 w-2 rounded-full shrink-0 ${dotClass(
                  t.days_in_stage,
                )}`}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white leading-snug line-clamp-2">{t.description}</p>
                <p className="text-[11px] text-navy-600">
                  {t.days_in_stage != null ? <span>{t.days_in_stage}d in stage</span> : null}
                  {t.next_action_owner ? <span> · {t.next_action_owner}</span> : null}
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
