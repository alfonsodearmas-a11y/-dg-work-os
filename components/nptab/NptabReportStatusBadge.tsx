import { NPTAB_STATUS_LABELS, type NptabReportStatus } from '@/lib/nptab/types';

const TONE: Record<NptabReportStatus, string> = {
  drafted: 'bg-navy-800 text-navy-400 border-navy-700',
  submitted: 'bg-blue-900/40 text-blue-300 border-blue-700/60',
  closed: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/60',
};

export function NptabReportStatusBadge({ status }: { status: NptabReportStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase border ${TONE[status]}`}
    >
      {NPTAB_STATUS_LABELS[status]}
    </span>
  );
}
