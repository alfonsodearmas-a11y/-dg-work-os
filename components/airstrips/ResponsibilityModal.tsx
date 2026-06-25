'use client';

import { useEffect, useState } from 'react';
import { Loader2, X, UserCog } from 'lucide-react';

interface Contractor { id: string; name: string; active: boolean }
interface Manager { id: string; name: string | null; email: string }

const selectClass = 'w-full bg-navy-950 border border-navy-800 rounded-lg px-3 py-2 text-sm text-white focus:border-gold-500 focus:outline-none';
const inputClass = selectClass;

export default function ResponsibilityModal({
  open, onClose, airstripId, currentContractorId, currentManagerId, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  airstripId: string;
  currentContractorId: string | null;
  currentManagerId: string | null;
  onSaved: () => void;
}) {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [contractorId, setContractorId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newWhatsapp, setNewWhatsapp] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAddingNew(false); setNewName(''); setNewContact(''); setNewWhatsapp('');
    setContractorId(currentContractorId ?? '');
    setManagerId(currentManagerId ?? '');
    setLoading(true);
    Promise.all([
      fetch('/api/airstrips/contractors?active=true').then(r => r.json()),
      fetch('/api/airstrips/managers').then(r => r.json()),
    ])
      .then(([c, m]) => { setContractors(c.contractors ?? []); setManagers(m.managers ?? []); })
      .catch(() => setError('Failed to load options'))
      .finally(() => setLoading(false));
  }, [open, currentContractorId, currentManagerId]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // 1. Resolve the contractor to assign (create one first if adding new).
      let resolvedContractorId = contractorId;
      if (addingNew) {
        if (!newName.trim()) { setError('Contractor name is required'); setSaving(false); return; }
        const res = await fetch('/api/airstrips/contractors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim(), contact: newContact.trim() || null, whatsapp: newWhatsapp.trim() || null }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to create contractor'); }
        resolvedContractorId = (await res.json()).contractor.id;
      }

      // 2. Apply contractor change (assign or clear) when it differs from current.
      if (resolvedContractorId !== (currentContractorId ?? '')) {
        if (resolvedContractorId) {
          const res = await fetch(`/api/airstrips/${airstripId}/contractor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contractor_id: resolvedContractorId }),
          });
          if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to assign contractor'); }
        } else {
          const res = await fetch(`/api/airstrips/${airstripId}/contractor`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to clear contractor');
        }
      }

      // 3. Apply manager change when it differs from current.
      if (managerId !== (currentManagerId ?? '')) {
        const res = await fetch(`/api/airstrips/${airstripId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ responsible_manager_id: managerId || null }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to set manager'); }
      }

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
            <UserCog className="h-4 w-4 text-gold-500" />
            <h2 className="text-sm font-semibold text-white">Responsibility</h2>
          </div>
          <button onClick={onClose} className="text-navy-600 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-navy-600" /></div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Contractor */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-400">Responsible contractor</label>
                <button type="button" onClick={() => setAddingNew(v => !v)} className="text-[11px] text-gold-500 hover:text-gold-400">
                  {addingNew ? 'Pick existing' : '+ New contractor'}
                </button>
              </div>
              {addingNew ? (
                <div className="space-y-2">
                  <input className={inputClass} placeholder="Contractor name" value={newName} onChange={e => setNewName(e.target.value)} />
                  <input className={inputClass} placeholder="Contact (optional)" value={newContact} onChange={e => setNewContact(e.target.value)} />
                  <input className={inputClass} placeholder="WhatsApp (optional)" value={newWhatsapp} onChange={e => setNewWhatsapp(e.target.value)} />
                </div>
              ) : (
                <select className={selectClass} value={contractorId} onChange={e => setContractorId(e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>

            {/* Manager */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Responsible manager</label>
              <select className={selectClass} value={managerId} onChange={e => setManagerId(e.target.value)}>
                <option value="">— Unassigned —</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>
            </div>

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
