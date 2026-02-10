'use client';

import { useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';

const AGENCIES = [
  { value: 'gpl', label: 'GPL — Guyana Power & Light' },
  { value: 'cjia', label: 'CJIA — Airport' },
  { value: 'gwi', label: 'GWI — Water' },
  { value: 'gcaa', label: 'GCAA — Civil Aviation' },
  { value: 'marad', label: 'MARAD — Maritime' },
  { value: 'heci', label: 'HECI — Hinterland' },
  { value: 'ppdi', label: 'PPDI — Policy' },
  { value: 'has', label: 'HAS — Hydro Services' },
];

const ROLES = [
  { value: 'ceo', label: 'CEO / Agency Head' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'data_entry', label: 'Data Entry' },
];

interface InviteUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function InviteUserModal({ open, onClose, onSuccess }: InviteUserModalProps) {
  const [form, setForm] = useState({ full_name: '', email: '', agency: '', role: 'ceo' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.email || !form.agency) {
      setError('All fields are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to invite user');
      setForm({ full_name: '', email: '', agency: '', role: 'ceo' });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-[#1a2744] border border-[#2d3a52] rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2d3a52]">
          <h2 className="text-lg font-semibold text-white">Invite User</h2>
          <button type="button" onClick={onClose} className="text-[#64748b] hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1">Full Name</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))}
              className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
              placeholder="John Smith"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
              placeholder="ceo@agency.gov.gy"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1">Agency</label>
            <select
              value={form.agency}
              onChange={(e) => setForm(f => ({ ...f, agency: e.target.value }))}
              className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
            >
              <option value="">Select agency...</option>
              {AGENCIES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
              className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
            >
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-[#2d3a52] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[#64748b] hover:text-white transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn-gold flex items-center gap-2 px-4 py-2 text-sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Invite
          </button>
        </div>
      </form>
    </div>
  );
}
