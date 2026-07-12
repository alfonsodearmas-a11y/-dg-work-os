'use client';

// OP Direct outbox — superadmin-only queue view. Every Direct Outreach update
// (assignment/unassignment, working status, remark, target date) enqueues one
// row here; the local session-bound bridge (scripts/opdirect-outbox-bridge.ts)
// posts them to OP Direct as case comments. This panel is read + triage only
// (Retry / Skip) — posting always happens through the bridge.

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { fmtGuyanaDateTime, truncate } from '@/lib/format';
import { OUTREACH_OUTBOX_STATUSES } from '@/lib/direct-outreach/types';
import type { OutreachOutboxRow, OutreachOutboxSummary } from '@/lib/direct-outreach/types';
import { OUTBOX_STATUS_VARIANTS } from './shared';

const KIND_LABELS: Record<OutreachOutboxRow['source_kind'], string> = {
  assignment: 'Assignment',
  unassignment: 'Unassignment',
  status: 'Status',
  remark: 'Remark',
  target: 'Target date',
};

export function OutboxPanel() {
  const [data, setData] = useState<OutreachOutboxSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/direct-outreach/outbox');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as OutreachOutboxSummary);
      setError(null);
    } catch {
      setError('Failed to load the OP Direct outbox.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (id: string, action: 'retry' | 'skip') => {
      setBusyRow(id);
      setActionError(null);
      try {
        const res = await fetch(`/api/direct-outreach/outbox/${id}/${action}`, { method: 'POST' });
        if (!res.ok) {
          const message = await res
            .json()
            .then((body) => body?.error as string | undefined)
            .catch(() => undefined);
          throw new Error(message || `Failed to ${action}`);
        }
        await load();
      } catch (err) {
        setActionError({ id, message: err instanceof Error ? err.message : `Failed to ${action}` });
      } finally {
        setBusyRow(null);
      }
    },
    [load],
  );

  if (loading) {
    return (
      <div className="card-premium flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-premium p-4 border border-red-500/30 flex items-center justify-between gap-3">
        <p className="text-red-400 text-sm">{error}</p>
        <button type="button" className="btn-navy text-xs" onClick={() => { setLoading(true); load(); }}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Counts strip */}
      <div className="card-premium p-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {OUTREACH_OUTBOX_STATUSES.map((status) => (
            <div key={status} className="flex items-center gap-2 px-2 py-1">
              <span className="stat-number text-2xl">{data.counts[status] ?? 0}</span>
              <Badge variant={OUTBOX_STATUS_VARIANTS[status]}>{status}</Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Queue table */}
      <div className="card-premium overflow-hidden">
        {data.rows.length === 0 ? (
          <EmptyState
            icon={<Send className="h-10 w-10" />}
            title="Outbox is empty"
            description="Officer updates and assignments enqueue here automatically and are posted to OP Direct by the bridge."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-premium">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Case</th>
                  <th>Kind</th>
                  <th>Author</th>
                  <th>Comment</th>
                  <th>OP status</th>
                  <th>Created</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="flex flex-col gap-1">
                        <Badge variant={OUTBOX_STATUS_VARIANTS[row.status]}>{row.status}</Badge>
                        {row.status === 'failed' && row.last_error && (
                          <span className="text-xs text-red-400" title={row.last_error}>
                            {truncate(row.last_error, 60)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">#{row.case_id}</td>
                    <td className="whitespace-nowrap">{KIND_LABELS[row.source_kind]}</td>
                    <td className="whitespace-nowrap">{row.author_label}</td>
                    <td className="max-w-md">
                      <span title={row.comment_text}>{truncate(row.comment_text, 120)}</span>
                      <span className="block text-xs text-navy-600 font-mono">{row.dgos_ref}</span>
                    </td>
                    <td>
                      {row.op_status_target ? (
                        <Badge variant="gold">{`→ ${row.op_status_target}`}</Badge>
                      ) : (
                        <span className="text-navy-600">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-sm">{fmtGuyanaDateTime(row.created_at)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        {(row.status === 'failed' || row.status === 'skipped') && (
                          <button
                            type="button"
                            className="btn-navy text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                            disabled={busyRow === row.id}
                            onClick={() => act(row.id, 'retry')}
                          >
                            <span className="inline-flex items-center gap-1">
                              <RefreshCw className="h-3 w-3" /> Retry
                            </span>
                          </button>
                        )}
                        {row.status === 'pending' && (
                          <button
                            type="button"
                            className="btn-navy text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                            disabled={busyRow === row.id}
                            onClick={() => act(row.id, 'skip')}
                          >
                            Skip
                          </button>
                        )}
                      </div>
                      {actionError?.id === row.id && (
                        <p className="text-xs text-red-400 mt-1">{actionError.message}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
