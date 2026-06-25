'use client';

import { useEffect, useState } from 'react';
import { Loader2, X, Settings2 } from 'lucide-react';

interface Settings {
  default_interval_days: number;
  upcoming_window_days: number;
  verification_stale_after_days: number;
}

const FIELDS: { key: keyof Settings; label: string; hint: string }[] = [
  { key: 'default_interval_days', label: 'Default maintenance interval (days)', hint: 'Used for any airstrip without its own override.' },
  { key: 'upcoming_window_days', label: 'Upcoming window (days)', hint: 'How far ahead of the due date a strip shows as "due soon".' },
  { key: 'verification_stale_after_days', label: 'Verification stale after (days)', hint: 'Flag a strip when its last verified maintenance is older than this.' },
];

export default function CadenceSettingsModal({ open, onClose, onSaved }: {
  open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);
    fetch('/api/airstrips/settings')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load settings')))
      .then(d => setForm(d.settings))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/airstrips/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to save'); }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card-premium w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-gold-500" />
            <h2 className="text-sm font-semibold text-white">Cadence Settings</h2>
          </div>
          <button onClick={onClose} className="text-navy-600 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        {loading || !form ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-navy-600" /></div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-xs text-slate-400 mb-1">{f.label}</label>
                <input
                  type="number"
                  min={f.key === 'upcoming_window_days' ? 0 : 1}
                  value={form[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: Number(e.target.value) })}
                  className="w-full bg-navy-950 border border-navy-800 rounded-lg px-3 py-2 text-sm text-white focus:border-gold-500 focus:outline-none"
                  required
                />
                <p className="text-[11px] text-navy-600 mt-1">{f.hint}</p>
              </div>
            ))}
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
              <button type="submit" disabled={saving} className="btn-gold px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-40">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
