'use client';
import { useState } from 'react';

export function CompleteDialog({ taskId, onClose, onDone }: { taskId: string; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Mark complete" onClose={onClose}>
      <p className="text-sm text-navy-600 mb-2">Completion note (≥10 chars). DG verifies before close.</p>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
        className="w-full bg-navy-900 border border-navy-800 rounded px-3 py-2 text-sm" />
      {err && <div className="text-xs text-red-500 mt-1">{err}</div>}
      <div className="flex gap-2 justify-end mt-3">
        <button onClick={onClose} className="px-3 py-1.5 text-xs border border-navy-800 rounded">Cancel</button>
        <button
          disabled={busy || note.trim().length < 10}
          className="px-3 py-1.5 text-xs bg-gold-500 text-navy-950 rounded disabled:opacity-50"
          onClick={async () => {
            setBusy(true); setErr(null);
            const res = await fetch(`/api/tasks/${taskId}/complete`, {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ note }),
            });
            setBusy(false);
            if (!res.ok) { setErr((await res.json().catch(() => ({ error: 'Failed' }))).error); return; }
            onDone();
          }}>Submit</button>
      </div>
    </Modal>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-navy-900 border border-navy-800 rounded-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg mb-2 text-white">{title}</h2>
        {children}
      </div>
    </div>
  );
}
