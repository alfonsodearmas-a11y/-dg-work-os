'use client';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ReviewBucket } from './ReviewBucket';
import { ReviewKeyboardShortcuts } from './ReviewKeyboardShortcuts';
import type { ReviewDecision } from './ReviewItemCard';
import type { ReviewableItem } from '@/lib/action-items/resolution/resolve';

interface UserOption { id: string; name: string; agency: string | null; }

interface Props {
  extractionId: string;
  meetingTitle: string | null;
  meetingDate: string | null;
  buckets: {
    mandatory: Array<{ index: number; item: ReviewableItem }>;
    quickScan: Array<{ index: number; item: ReviewableItem }>;
    autoAccepted: Array<{ index: number; item: ReviewableItem }>;
  };
  ownerOptions: UserOption[];
}

export function ReviewClient({ extractionId, meetingTitle, meetingDate, buckets, ownerOptions }: Props) {
  const router = useRouter();
  // Carry the resolver-resolved owner_id into each seeded decision. Without
  // this, quick-scan items that the resolver matched (the dropdown shows
  // the right name) submit with edits.owner_user_id=undefined and the gate
  // 400s "no owner" — the desync that blocked the 40-item smoke on
  // 2026-05-05 (extraction 3f95d9d2). The dropdown's local state was the
  // only place the resolved owner lived; now it lives in the decision too.
  const seedEdits = (it: { item: ReviewableItem }): ReviewDecision['edits'] =>
    it.item.owner_id ? { owner_user_id: it.item.owner_id } : {};
  const [decisions, setDecisions] = useState<Map<number, ReviewDecision>>(() => {
    const m = new Map<number, ReviewDecision>();
    // Mandatory items start UNDECIDED — forces an explicit accept/reject click
    // and the server-side gate refuses to close the extraction unless every
    // index is decided. Quick-scan and auto-accepted items are pre-accepted
    // per spec §7 (gate-pass means low political risk).
    for (const it of buckets.quickScan) m.set(it.index, { index: it.index, action: 'accept', edits: seedEdits(it), was_edited: false });
    for (const it of buckets.autoAccepted) m.set(it.index, { index: it.index, action: 'accept', edits: seedEdits(it), was_edited: false });
    return m;
  });
  const totalItems = buckets.mandatory.length + buckets.quickScan.length + buckets.autoAccepted.length;
  const undecidedCount = totalItems - decisions.size;
  const setDecision = useCallback((d: ReviewDecision) => {
    setDecisions(prev => { const next = new Map(prev); next.set(d.index, d); return next; });
  }, []);
  const acceptAll = useCallback(() => {
    setDecisions(prev => {
      const next = new Map(prev);
      for (const b of [buckets.mandatory, buckets.quickScan, buckets.autoAccepted]) {
        for (const it of b) {
          const cur = next.get(it.index);
          const edits = cur?.edits ?? seedEdits(it);
          next.set(it.index, { index: it.index, action: 'accept', edits, was_edited: cur?.was_edited ?? false });
        }
      }
      return next;
    });
  }, [buckets]);

  async function submit() {
    if (undecidedCount > 0) return;
    const arr = Array.from(decisions.values());
    const res = await fetch(`/api/action-items/review/${extractionId}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decisions: arr }),
    });
    if (res.ok) router.push('/action-items/review');
    else alert((await res.json().catch(() => ({ error: 'Failed' }))).error);
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="stat-number text-xl">{meetingTitle ?? '(untitled)'}</h1>
        <div className="text-xs text-navy-600">{meetingDate ? new Date(meetingDate).toLocaleString() : ''}</div>
      </div>
      <ReviewBucket title="🔴 Mandatory review" items={buckets.mandatory} defaultAction="reject"
        ownerOptions={ownerOptions} decisions={decisions} setDecision={setDecision} />
      <ReviewBucket title="🟡 Quick scan (pre-accepted)" items={buckets.quickScan} defaultAction="accept"
        ownerOptions={ownerOptions} decisions={decisions} setDecision={setDecision} />
      <ReviewBucket title="🟢 Auto-accepted" items={buckets.autoAccepted} defaultAction="accept"
        ownerOptions={ownerOptions} decisions={decisions} setDecision={setDecision} collapsed />
      <div className="flex items-center justify-end gap-3">
        {undecidedCount > 0 && (
          <span className="text-xs text-red-400">
            {undecidedCount} item{undecidedCount === 1 ? '' : 's'} undecided — accept or reject each to enable Submit
          </span>
        )}
        <button onClick={acceptAll} className="px-3 py-1 text-xs border border-navy-800 rounded">Accept all</button>
        <button
          onClick={submit}
          disabled={undecidedCount > 0}
          className="px-3 py-1 text-xs bg-gold-500 text-navy-950 rounded disabled:bg-navy-800 disabled:text-navy-600 disabled:cursor-not-allowed"
        >
          Submit (⌘↵)
        </button>
      </div>
      <ReviewKeyboardShortcuts onAcceptAll={acceptAll} onSubmit={submit} />
    </div>
  );
}
