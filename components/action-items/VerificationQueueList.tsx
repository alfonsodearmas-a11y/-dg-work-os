'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DisputeDialog } from './DisputeDialog';

export interface AwaitingItem {
  id: string;
  title: string;
  agency: string | null;
  owner_name: string | null;
  completion_note: string | null;
  completed_at: string | null;
}

export function VerificationQueueList({ items }: { items: AwaitingItem[] }) {
  const router = useRouter();
  const [disputeId, setDisputeId] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-white">
        Awaiting your verification <span className="text-xs text-navy-600">({items.length})</span>
      </h2>
      {items.map(it => (
        <div key={it.id} className="bg-navy-900 border border-navy-800 rounded-lg p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="text-xs text-navy-600 mb-1">{it.agency ?? '—'} · {it.owner_name ?? '(unknown)'}</div>
              <div className="text-sm text-white">{it.title}</div>
              {it.completion_note && (
                <div className="text-xs mt-1 border-l-2 border-gold-500 pl-2 text-navy-300">
                  Owner says: {it.completion_note}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <button
                className="px-2 py-1 text-xs bg-gold-500 text-navy-950 rounded"
                onClick={async () => {
                  await fetch(`/api/tasks/${it.id}/verify`, { method: 'POST' });
                  router.refresh();
                }}>
                Confirm
              </button>
              <button
                className="px-2 py-1 text-xs border border-navy-800 rounded"
                onClick={() => setDisputeId(it.id)}>
                Dispute
              </button>
            </div>
          </div>
        </div>
      ))}
      {disputeId && (
        <DisputeDialog
          taskId={disputeId}
          onClose={() => setDisputeId(null)}
          onDone={() => { setDisputeId(null); router.refresh(); }}
        />
      )}
    </section>
  );
}
