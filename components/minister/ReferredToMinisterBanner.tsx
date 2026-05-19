import Link from 'next/link';
import { fmtGuyanaDate } from '@/lib/format';

export interface ActiveMinisterReferralBrief {
  taskId: string;
  flaggedAt: string;
}

interface Props {
  referral: ActiveMinisterReferralBrief | null | undefined;
  compact?: boolean;
}

/**
 * Inline pill rendered on tender / project cards when the row has been
 * referred to the Minister via a flagged task. Links to the task detail
 * panel so the reader can open the conversation.
 */
export function ReferredToMinisterBanner({ referral, compact = false }: Props) {
  if (!referral) return null;
  const date = fmtGuyanaDate(referral.flaggedAt);
  return (
    <Link
      href={`/tasks?taskId=${referral.taskId}`}
      className={[
        'block text-[11px] text-gold-400 bg-gold-500/10 border border-gold-500/30 rounded px-2 py-1 hover:bg-gold-500/15 transition-colors',
        compact ? 'mt-1.5' : 'mt-2',
      ].join(' ')}
    >
      Referred to Minister {date}.
    </Link>
  );
}
