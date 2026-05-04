'use client';
import { useState } from 'react';
import { Modal } from './CompleteDialog';

export function DisputeDialog({ taskId, onClose, onDone }: { taskId: string; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Dispute completion" onClose={onClose}>
      <p className="text-sm text-navy-600 mb-2">Substantive reason (≥20 chars). Owner is notified and can re-attempt or push back.</p>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
        className="w-full bg-navy-900 border border-navy-800 rounded px-3 py-2 text-sm" />
      {err && <div className="text-xs text-red-500 mt-1">{err}</div>}
      <div className="flex gap-2 justify-end mt-3">
        <button onClick={onClose} className="px-3 py-1.5 text-xs border border-navy-800 rounded">Cancel</button>
        <button
          disabled={busy || note.trim().length < 20}
          className="px-3 py-1.5 text-xs bg-gold-500 text-navy-950 rounded disabled:opacity-50"
          onClick={async () => {
            setBusy(true); setErr(null);
            const res = await fetch(`/api/tasks/${taskId}/dispute`, {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ note }),
            });
            setBusy(false);
            if (!res.ok) { setErr((await res.json().catch(() => ({ error: 'Failed' }))).error); return; }
            onDone();
          }}>Dispute</button>
      </div>
    </Modal>
  );
}
