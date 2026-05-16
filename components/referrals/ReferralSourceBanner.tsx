import { fmtGuyanaDate } from '@/lib/format';
import { STATUS_LABELS, type ReferralStatus } from '@/lib/referrals/types';

export interface ActiveReferralBrief {
  reference_number: string;
  status: ReferralStatus;
  submitted_at: string;
}

interface Props {
  referral: ActiveReferralBrief | null | undefined;
  compact?: boolean;
}

export function ReferralSourceBanner({ referral, compact = false }: Props) {
  if (!referral) return null;
  const date = fmtGuyanaDate(referral.submitted_at);
  return (
    <div
      className={[
        'text-[11px] text-gold-400 bg-gold-500/10 border border-gold-500/30 rounded px-2 py-1',
        compact ? 'mt-1.5' : 'mt-2',
      ].join(' ')}
    >
      Referred to Minister {date}, Ref{' '}
      <span className="font-mono">{referral.reference_number}</span>. Status:{' '}
      {STATUS_LABELS[referral.status]}.
    </div>
  );
}
