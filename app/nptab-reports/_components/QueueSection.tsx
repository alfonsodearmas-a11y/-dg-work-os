'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { fmtBudgetAmount, fmtGuyanaDate } from '@/lib/format';
import type { NptabQueueRowWithTender } from '@/lib/nptab/types';

interface Props {
  queue: NptabQueueRowWithTender[];
  upcomingPeriodLabel: string;
  canEdit: boolean;
}

export function QueueSection({ queue, upcomingPeriodLabel, canEdit }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/nptab-reports', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Failed to generate draft report');
      router.push(j.redirectTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate');
      setBusy(false);
    }
  }

  async function remove(queueId: string) {
    const reason = window.prompt('Remove this tender from the queue. Reason?');
    if (reason === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/nptab-reports/queue?queue_id=${queueId}&reason=${encodeURIComponent(reason)}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Remove failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Current Queue</h2>
          <p className="text-sm text-navy-500">
            {queue.length} tender{queue.length === 1 ? '' : 's'} queued. Upcoming report period: {upcomingPeriodLabel}.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={generate}
            disabled={busy || queue.length === 0}
            className="btn-gold text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Generate Draft Report
          </button>
        )}
      </header>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-900/40 border border-red-700/60 text-red-200 text-sm flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-navy-500 border-b border-navy-800">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Agency</th>
              <th className="px-4 py-3">Contract Value</th>
              <th className="px-4 py-3">Queued</th>
              <th className="px-4 py-3">Queued By</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-navy-500">
                  Queue is empty. Use the Escalate modal on a tender to add it to the next NPTAB report.
                </td>
              </tr>
            ) : (
              queue.map((r) => (
                <tr key={r.id} className="border-b border-navy-800/60 hover:bg-navy-900/40">
                  <td className="px-4 py-3 text-white max-w-[28rem] truncate">{r.tender_title ?? r.tender_id}</td>
                  <td className="px-4 py-3 text-white">{r.tender_agency ?? '-'}</td>
                  <td className="px-4 py-3 text-navy-300 tabular-nums">
                    {r.contract_value != null ? fmtBudgetAmount(r.contract_value) : '-'}
                  </td>
                  <td className="px-4 py-3 text-navy-300">{fmtGuyanaDate(r.queued_at)}</td>
                  <td className="px-4 py-3 text-navy-300">{r.queued_by_name ?? '-'}</td>
                  <td className="px-4 py-3 text-navy-300 max-w-[20rem] truncate">{r.reason ?? '-'}</td>
                  <td className="px-4 py-3 text-right">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        disabled={busy}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
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
