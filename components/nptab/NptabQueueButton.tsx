'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { containsEmDash } from '@/lib/text/punctuation-guard';
import { fmtGuyanaDate } from '@/lib/format';

interface Props {
  tenderId: string;
  tenderTitle: string;
  tenderAgency: string;
  daysBreach: number | null;
  upcomingPeriodLabel: string;
  onCompleted: (message: string) => void;
  onCancel: () => void;
}

type State =
  | { kind: 'loading' }
  | { kind: 'queue'; reason: string }
  | { kind: 'already-queued'; queueId: string; queuedAt: string; reason: string };

export function NptabQueueButton(props: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/nptab-reports/queue?tender_id=${encodeURIComponent(props.tenderId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Failed to load queue state');
        return r.json() as Promise<{ row: { id: string; queued_at: string } | null }>;
      })
      .then((j) => {
        if (cancelled) return;
        if (j.row) {
          setState({ kind: 'already-queued', queueId: j.row.id, queuedAt: j.row.queued_at, reason: '' });
        } else {
          setState({ kind: 'queue', reason: '' });
        }
      })
      .catch(() => { if (!cancelled) setState({ kind: 'queue', reason: '' }); });
    return () => { cancelled = true; };
  }, [props.tenderId]);

  const reason = state.kind === 'loading' ? '' : state.reason;
  const reasonHasEmDash = containsEmDash(reason);

  async function queue() {
    if (state.kind !== 'queue') return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/nptab-reports/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tender_id: props.tenderId, reason: state.reason || null }),
      });
      const j = await res.json();
      if (res.status === 409) {
        setState({ kind: 'already-queued', queueId: j.queueId, queuedAt: new Date().toISOString(), reason: '' });
        return;
      }
      if (!res.ok) throw new Error(j.error ?? 'Failed to queue');
      props.onCompleted(`Added to NPTAB queue for ${props.upcomingPeriodLabel}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to queue');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (state.kind !== 'already-queued') return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/nptab-reports/queue?queue_id=${state.queueId}&reason=${encodeURIComponent(state.reason || '')}`,
        { method: 'DELETE' },
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Failed to remove from queue');
      props.onCompleted('Removed from NPTAB queue.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove from queue');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card-premium p-3 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-500">Tender</p>
        <p className="text-sm text-white">{props.tenderTitle}</p>
        <p className="text-xs text-navy-400">
          {props.tenderAgency}
          {props.daysBreach != null && ` · ${props.daysBreach} days past SLA`}
        </p>
      </div>

      {state.kind === 'loading' ? (
        <p className="text-sm text-navy-500 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Checking queue
        </p>
      ) : state.kind === 'queue' ? (
        <>
          <p className="text-xs text-navy-500">
            Queueing this tender adds it to the next NPTAB Procurement Performance Report ({props.upcomingPeriodLabel}).
          </p>
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wider text-navy-500 mb-1">
              Reason (optional)
            </span>
            <textarea
              value={state.reason}
              onChange={(e) => setState({ kind: 'queue', reason: e.target.value })}
              rows={3}
              className={[
                'w-full px-3 py-2 bg-navy-950 border rounded-lg text-white placeholder-navy-600',
                reasonHasEmDash ? 'border-red-500/60' : 'border-navy-800 focus:border-gold-500',
                'focus:outline-none transition-colors',
              ].join(' ')}
              placeholder="Pattern of breaches, recurring contractor, etc."
            />
            {reasonHasEmDash && <p className="text-xs text-red-400 mt-1">Em-dashes are not permitted.</p>}
          </label>
        </>
      ) : (
        <>
          <p className="text-sm text-amber-300">
            Already queued for the {props.upcomingPeriodLabel} NPTAB report (since {fmtGuyanaDate(state.queuedAt)}).
          </p>
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wider text-navy-500 mb-1">
              Remove reason (optional)
            </span>
            <textarea
              value={state.reason}
              onChange={(e) => setState({ ...state, reason: e.target.value })}
              rows={2}
              className={[
                'w-full px-3 py-2 bg-navy-950 border rounded-lg text-white placeholder-navy-600',
                reasonHasEmDash ? 'border-red-500/60' : 'border-navy-800 focus:border-gold-500',
                'focus:outline-none transition-colors',
              ].join(' ')}
            />
            {reasonHasEmDash && <p className="text-xs text-red-400 mt-1">Em-dashes are not permitted.</p>}
          </label>
        </>
      )}

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-2">
          <AlertCircle size={12} /> {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {state.kind === 'queue' && (
          <button type="button" onClick={queue} disabled={busy || reasonHasEmDash} className="btn-gold text-sm disabled:opacity-50">
            {busy ? 'Adding...' : 'Add to NPTAB Queue'}
          </button>
        )}
        {state.kind === 'already-queued' && (
          <button type="button" onClick={remove} disabled={busy || reasonHasEmDash} className="text-sm text-red-400 hover:text-red-300 px-3 py-2 disabled:opacity-50">
            {busy ? 'Removing...' : 'Remove from Queue'}
          </button>
        )}
        <button type="button" onClick={props.onCancel} className="text-sm text-navy-500 hover:text-white px-3 py-2">
          Cancel
        </button>
      </div>
    </div>
  );
}
