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
  const [decisions, setDecisions] = useState<Map<number, ReviewDecision>>(() => {
    const m = new Map<number, ReviewDecision>();
    // Mandatory default to no decision (forces explicit accept/reject); quick-scan defaults to accept.
    for (const it of buckets.quickScan) m.set(it.index, { index: it.index, action: 'accept', edits: {}, was_edited: false });
    for (const it of buckets.autoAccepted) m.set(it.index, { index: it.index, action: 'accept', edits: {}, was_edited: false });
    return m;
  });
  const setDecision = useCallback((d: ReviewDecision) => {
    setDecisions(prev => { const next = new Map(prev); next.set(d.index, d); return next; });
  }, []);
  const acceptAll = useCallback(() => {
    setDecisions(prev => {
      const next = new Map(prev);
      for (const b of [buckets.mandatory, buckets.quickScan, buckets.autoAccepted]) {
        for (const it of b) {
          const cur = next.get(it.index);
          next.set(it.index, { index: it.index, action: 'accept', edits: cur?.edits ?? {}, was_edited: cur?.was_edited ?? false });
        }
      }
      return next;
    });
  }, [buckets]);

  async function submit() {
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
      <div className="flex justify-end gap-2">
        <button onClick={acceptAll} className="px-3 py-1 text-xs border border-navy-800 rounded">Accept all</button>
        <button onClick={submit} className="px-3 py-1 text-xs bg-gold-500 text-navy-950 rounded">Submit (⌘↵)</button>
      </div>
      <ReviewKeyboardShortcuts onAcceptAll={acceptAll} onSubmit={submit} />
    </div>
  );
}
