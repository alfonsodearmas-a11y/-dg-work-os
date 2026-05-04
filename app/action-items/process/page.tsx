'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function ProcessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const m = searchParams.get('meeting_id');
    if (m) setId(m);
  }, [searchParams]);

  async function submit() {
    setBusy(true); setErr(null);
    const res = await fetch('/api/action-items/extract', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fireflies_meeting_id: id, modality: 'virtual' }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({ error: 'Failed' }))).error);
      return;
    }
    const { extraction_id } = await res.json();
    router.push(`/action-items/review/${extraction_id}`);
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-xl text-white">Run extraction</h1>
      <p className="text-sm text-navy-600">
        The pipeline runs Claude with the virtual prompt and redirects to the review queue.
      </p>
      <input value={id} onChange={e => setId(e.target.value)} placeholder="Fireflies meeting id"
        className="w-full bg-navy-900 border border-navy-800 rounded px-3 py-2 text-sm" />
      {err && <div className="text-xs text-red-500">{err}</div>}
      <button disabled={busy || !id} onClick={submit}
        className="px-3 py-1.5 text-sm bg-gold-500 text-navy-950 rounded disabled:opacity-50">
        {busy ? 'Running…' : 'Extract'}
      </button>
    </div>
  );
}
