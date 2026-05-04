'use client';
import { useRouter } from 'next/navigation';

export interface PushbackEntry {
  id: string;
  title: string;
  agency: string | null;
  owner_name: string | null;
  dispute_note: string;
  pushback_text: string;
  pushback_at: string;
}

export function PushbackQueueList({ items }: { items: PushbackEntry[] }) {
  const router = useRouter();
  if (items.length === 0) return null;
  return (
    <section className="space-y-2 mt-4">
      <h2 className="text-base font-semibold text-white">
        Pushbacks needing your attention <span className="text-xs text-navy-600">({items.length})</span>
      </h2>
      {items.map(p => (
        <div key={p.id} className="bg-navy-900 border border-gold-500/40 rounded-lg p-3">
          <div className="text-xs text-navy-600 mb-1">{p.agency ?? '—'} · {p.owner_name ?? '(unknown)'}</div>
          <div className="text-sm text-white mb-2">{p.title}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="border-l-2 border-red-500 pl-2">
              <div className="uppercase text-navy-600 mb-0.5">Your dispute</div>
              <div>{p.dispute_note}</div>
            </div>
            <div className="border-l-2 border-gold-500 pl-2">
              <div className="uppercase text-navy-600 mb-0.5">Owner pushback</div>
              <div>{p.pushback_text}</div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              className="px-2 py-1 text-xs bg-gold-500 text-navy-950 rounded"
              onClick={async () => {
                await fetch('/api/tasks/bulk', {
                  method: 'PATCH', headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ taskIds: [p.id], updates: { status: 'done' } }),
                });
                router.refresh();
              }}>
              Accept (mark done)
            </button>
            <a href={`/tasks?focus=${p.id}`} className="px-2 py-1 text-xs border border-navy-800 rounded">
              Open task
            </a>
          </div>
        </div>
      ))}
    </section>
  );
}
