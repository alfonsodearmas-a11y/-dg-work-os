import Link from 'next/link';
import { Briefcase } from 'lucide-react';
import {
  EVAL_DANGER_DAYS,
  EVAL_WARN_DAYS,
  type CriticalTenderRow,
  type EvaluationTenderRow,
} from '@/lib/procurement/queries';
import { BentoCard, CardHead } from '@/components/intel/common';

const PREVIEW_COUNT = 4;

const CRITICAL_REASON_LABEL: Record<CriticalTenderRow['reason'], string> = {
  missing_pending_decision: 'pending decision',
  missing_from_upload: 'missing from upload',
  stale_award: 'stale award',
};

interface ProcurementCardProps {
  critical: CriticalTenderRow[];
  evaluation: EvaluationTenderRow[];
  href: string;
  className?: string;
  accent?: string;
}

// Single window into the agency's procurement pipeline — critical tenders
// (stuck / pending decision / stale award) appear first, then tenders in
// evaluation. Critical and evaluation were two separate cards in the first
// pass of the bento, which read as duplicate cells of the same concept; this
// view keeps the distinction visible (red chip, dot color) without claiming
// two grid slots.
export function ProcurementCard({
  critical,
  evaluation,
  href,
  className,
  accent,
}: ProcurementCardProps) {
  const totalCritical = critical.length;
  const totalEval = evaluation.length;
  const total = totalCritical + totalEval;

  const oldestCritical = critical.reduce(
    (m, t) => Math.max(m, t.days_in_stage ?? 0),
    0,
  );
  const oldestEval = evaluation.reduce(
    (m, t) => Math.max(m, t.days_in_stage ?? 0),
    0,
  );
  const oldest = Math.max(oldestCritical, oldestEval);

  // Critical rows always win the top of the preview, sorted longest-stuck
  // first. Eval rows fill the remainder, same sort. The Card is a single
  // visual block but the bucket of each row stays readable via dot + chip.
  const sortedCritical = [...critical].sort(
    (a, b) => (b.days_in_stage ?? 0) - (a.days_in_stage ?? 0),
  );
  const sortedEval = [...evaluation].sort(
    (a, b) => (b.days_in_stage ?? 0) - (a.days_in_stage ?? 0),
  );
  const preview = [
    ...sortedCritical.map((row) => ({ kind: 'critical' as const, row })),
    ...sortedEval.map((row) => ({ kind: 'eval' as const, row })),
  ].slice(0, PREVIEW_COUNT);

  return (
    <BentoCard
      className={className}
      ariaLabel={`Procurement: ${total} active tenders${totalCritical ? `, ${totalCritical} critical` : ''}`}
    >
      <CardHead
        icon={<Briefcase size={14} />}
        iconAccent={accent}
        title="Procurement"
        right={
          <span className="text-[11px] tabular-nums">
            <span className="text-white font-semibold">{total}</span>
            {totalCritical > 0 ? (
              <span className="text-red-400"> · {totalCritical} critical</span>
            ) : null}
            {oldest > 0 ? (
              <span className="text-navy-600"> · oldest {oldest}d</span>
            ) : null}
          </span>
        }
      />

      {total === 0 ? (
        <p className="text-xs text-navy-600 italic">No active tenders in the pipeline.</p>
      ) : (
        <ul className="space-y-2 flex-1 min-h-0">
          {preview.map((item) =>
            item.kind === 'critical' ? (
              <CriticalRow key={`c-${item.row.id}`} row={item.row} />
            ) : (
              <EvalRow key={`e-${item.row.id}`} row={item.row} />
            ),
          )}
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

function CriticalRow({ row }: { row: CriticalTenderRow }) {
  return (
    <li className="flex items-start gap-2.5 min-w-0">
      <span
        className="mt-1.5 inline-flex h-2 w-2 rounded-full shrink-0 bg-red-400"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white leading-snug line-clamp-2">{row.description}</p>
        <p className="text-[11px] text-navy-600 flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-red-400/15 text-red-400">
            Critical
          </span>
          <span className="uppercase">{row.stage.replace(/_/g, ' ')}</span>
          <span>· {CRITICAL_REASON_LABEL[row.reason]}</span>
          {row.days_in_stage != null ? <span>· {row.days_in_stage}d</span> : null}
        </p>
      </div>
    </li>
  );
}

function EvalRow({ row }: { row: EvaluationTenderRow }) {
  const days = row.days_in_stage;
  const dotClass =
    days == null
      ? 'bg-navy-700'
      : days > EVAL_DANGER_DAYS
        ? 'bg-red-400'
        : days > EVAL_WARN_DAYS
          ? 'bg-amber-400'
          : 'bg-emerald-500';
  return (
    <li className="flex items-start gap-2.5 min-w-0">
      <span
        className={`mt-1.5 inline-flex h-2 w-2 rounded-full shrink-0 ${dotClass}`}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white leading-snug line-clamp-2">{row.description}</p>
        <p className="text-[11px] text-navy-600">
          <span className="uppercase tracking-wide">Evaluation</span>
          {days != null ? <span> · {days}d in stage</span> : null}
          {row.next_action_owner ? <span> · {row.next_action_owner}</span> : null}
        </p>
      </div>
    </li>
  );
}
