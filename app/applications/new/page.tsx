'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, CheckCircle } from 'lucide-react';

const TYPE_OPTIONS = [
  'New Connection',
  'Meter Change',
  'Reconnection',
  'Service Upgrade',
  'Disconnection Review',
  'Billing Dispute',
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const AGENCY_OPTIONS = [
  { value: 'gpl', label: 'GPL' },
  { value: 'gwi', label: 'GWI' },
  { value: 'cjia', label: 'CJIA' },
  { value: 'gcaa', label: 'GCAA' },
];

export default function NewApplicationPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [form, setForm] = useState({
    applicant_name: '',
    application_type: '',
    reference_number: '',
    priority: 'normal',
    notes: '',
    agency: '',
  });

  const userRole = (session?.user as { role?: string })?.role || 'officer';
  const userAgency = (session?.user as { agency?: string | null })?.agency;
  const isDG = userRole === 'dg';

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.applicant_name.trim() || !form.application_type) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          agency: isDG ? form.agency || userAgency : userAgency,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/applications/${data.application.id}`);
      } else {
        showToast(data.error || 'Failed to create application', 'error');
      }
    } catch {
      showToast('Failed to create application', 'error');
    }
    setSubmitting(false);
  };

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/applications"
          className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#1a2744] transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">New Application</h1>
          <p className="text-sm text-[#64748b] mt-0.5">Submit a new customer service application</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card-premium p-6 space-y-5">
        <div>
          <label htmlFor="app-name" className="block text-xs text-[#94a3b8] mb-1.5">Applicant Name *</label>
          <input
            id="app-name"
            type="text"
            value={form.applicant_name}
            onChange={e => updateField('applicant_name', e.target.value)}
            placeholder="Full name of applicant"
            required
            className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
          />
        </div>

        <div>
          <label htmlFor="app-type" className="block text-xs text-[#94a3b8] mb-1.5">Application Type *</label>
          <select
            id="app-type"
            value={form.application_type}
            onChange={e => updateField('application_type', e.target.value)}
            required
            className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
          >
            <option value="">Select type</option>
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="app-ref" className="block text-xs text-[#94a3b8] mb-1.5">Reference Number</label>
          <input
            id="app-ref"
            type="text"
            value={form.reference_number}
            onChange={e => updateField('reference_number', e.target.value)}
            placeholder="e.g. GPL-2026-0001"
            className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
          />
        </div>

        <div>
          <label htmlFor="app-priority" className="block text-xs text-[#94a3b8] mb-1.5">Priority</label>
          <select
            id="app-priority"
            value={form.priority}
            onChange={e => updateField('priority', e.target.value)}
            className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
          >
            {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {isDG && (
          <div>
            <label htmlFor="app-agency" className="block text-xs text-[#94a3b8] mb-1.5">Agency</label>
            <select
              id="app-agency"
              value={form.agency}
              onChange={e => updateField('agency', e.target.value)}
              className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
            >
              <option value="">Select agency</option>
              {AGENCY_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="app-notes" className="block text-xs text-[#94a3b8] mb-1.5">Notes</label>
          <textarea
            id="app-notes"
            value={form.notes}
            onChange={e => updateField('notes', e.target.value)}
            placeholder="Additional details about the application..."
            rows={4}
            className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !form.applicant_name.trim() || !form.application_type}
          className="w-full py-2.5 rounded-lg bg-[#d4af37] text-[#0a1628] font-semibold text-sm hover:bg-[#e5c348] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Creating...' : 'Create Application'}
        </button>
      </form>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
