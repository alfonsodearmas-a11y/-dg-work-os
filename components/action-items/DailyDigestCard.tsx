import type { DigestSummary } from '@/lib/action-items/digest';

export function DailyDigestCard({ summary }: { summary: DigestSummary }) {
  const stats = [
    { label: 'observed',  value: summary.observed },
    { label: 'extracted', value: summary.extracted },
    { label: 'queued',    value: summary.queued },
    { label: 'skipped',   value: summary.skipped },
    { label: 'failed',    value: summary.failed },
  ];
  return (
    <div className="bg-navy-900 border border-navy-800 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm uppercase text-navy-600">Yesterday&apos;s pipeline</h2>
        <span className="text-xs text-navy-600">
          {new Date(summary.date_range.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-3">
        {stats.map(s => (
          <div key={s.label} className="text-center">
            <div className="text-xl text-white font-semibold">{s.value}</div>
            <div className="text-[10px] uppercase text-navy-600">{s.label}</div>
          </div>
        ))}
      </div>
      {summary.failed_extraction_count > 0 && (
        <div className="mt-3 text-xs text-red-500">
          {summary.failed_extraction_count} failed extraction{summary.failed_extraction_count === 1 ? '' : 's'} need attention.
        </div>
      )}
    </div>
  );
}
