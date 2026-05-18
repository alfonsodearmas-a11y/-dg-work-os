'use client';

import Link from 'next/link';
import { fmtBudgetAmount, fmtGuyanaDate } from '@/lib/format';
import type { NptabReport } from '@/lib/nptab/types';
import { periodLabel } from '@/lib/nptab/period';
import { NptabReportStatusBadge } from '@/components/nptab/NptabReportStatusBadge';

export function NptabReportsList({ reports }: { reports: NptabReport[] }) {
  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-lg font-semibold text-white">Past Reports</h2>
        <p className="text-sm text-navy-500">{reports.length} report{reports.length === 1 ? '' : 's'} on record.</p>
      </header>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-navy-500 border-b border-navy-800">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Generated</th>
              <th className="px-4 py-3 text-right">Tenders</th>
              <th className="px-4 py-3 text-right">Total Value</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-navy-500">
                  No reports yet. Generate the first draft from the current queue.
                </td>
              </tr>
            ) : (
              reports.map((r) => (
                <tr key={r.id} className="border-b border-navy-800/60 hover:bg-navy-900/40">
                  <td className="px-4 py-3 font-mono text-gold-400">
                    <Link href={`/nptab-reports/${r.id}`}>{r.reference_number ?? 'DRAFT'}</Link>
                  </td>
                  <td className="px-4 py-3 text-white">{periodLabel(r.period_start, r.period_end)}</td>
                  <td className="px-4 py-3"><NptabReportStatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-navy-300">{fmtGuyanaDate(r.submitted_at ?? r.generated_at)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-navy-300">{r.tender_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-navy-300">
                    {r.total_value != null ? fmtBudgetAmount(r.total_value) : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
