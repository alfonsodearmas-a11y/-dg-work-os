'use client';
import { useState } from 'react';
import { Modal } from './CompleteDialog';

export function PushbackDialog({ taskId, onClose, onDone }: { taskId: string; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Push back on dispute" onClose={onClose}>
      <p className="text-sm text-navy-600 mb-2">Comment (≥20 chars). Task stays open. DG sees this in their verification queue.</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
        className="w-full bg-navy-900 border border-navy-800 rounded px-3 py-2 text-sm" />
      {err && <div className="text-xs text-red-500 mt-1">{err}</div>}
      <div className="flex gap-2 justify-end mt-3">
        <button onClick={onClose} className="px-3 py-1.5 text-xs border border-navy-800 rounded">Cancel</button>
        <button
          disabled={busy || text.trim().length < 20}
          className="px-3 py-1.5 text-xs bg-gold-500 text-navy-950 rounded disabled:opacity-50"
          onClick={async () => {
            setBusy(true); setErr(null);
            const res = await fetch(`/api/tasks/${taskId}/pushback`, {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ text }),
            });
            setBusy(false);
            if (!res.ok) { setErr((await res.json().catch(() => ({ error: 'Failed' }))).error); return; }
            onDone();
          }}>Send</button>
      </div>
    </Modal>
  );
}
