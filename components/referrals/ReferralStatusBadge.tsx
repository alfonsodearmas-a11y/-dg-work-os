import { STATUS_LABELS, type ReferralStatus } from '@/lib/referrals/types';

const STATUS_TONE: Record<ReferralStatus, string> = {
  drafted: 'bg-navy-800 text-navy-400 border-navy-700',
  submitted: 'bg-blue-900/40 text-blue-300 border-blue-700/60',
  with_minister: 'bg-amber-900/40 text-amber-300 border-amber-700/60',
  direction_given: 'bg-purple-900/40 text-purple-300 border-purple-700/60',
  closed: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/60',
};

export function ReferralStatusBadge({ status }: { status: ReferralStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase border ${STATUS_TONE[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
