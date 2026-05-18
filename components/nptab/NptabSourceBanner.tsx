import { fmtGuyanaDate } from '@/lib/format';
import type { ActiveNptabQueueBrief, NptabReportBrief } from '@/lib/nptab/source-lookup';

interface Props {
  queued?: ActiveNptabQueueBrief | null;
  reported?: NptabReportBrief | null;
  compact?: boolean;
}

export function NptabSourceBanner({ queued, reported, compact = false }: Props) {
  if (reported) {
    return (
      <div className={[
        'text-[11px] text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded px-2 py-1',
        compact ? 'mt-1.5' : 'mt-2',
      ].join(' ')}>
        Reported to NPTAB {fmtGuyanaDate(reported.submitted_at)}, Ref{' '}
        <a href={`/nptab-reports/${reported.report_id}`} className="font-mono underline">
          {reported.reference_number}
        </a>.
      </div>
    );
  }
  if (queued) {
    return (
      <div className={[
        'text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1',
        compact ? 'mt-1.5' : 'mt-2',
      ].join(' ')}>
        Queued for NPTAB report {fmtGuyanaDate(queued.queued_at)}. Will be included in {queued.upcoming_period_label}.
      </div>
    );
  }
  return null;
}
