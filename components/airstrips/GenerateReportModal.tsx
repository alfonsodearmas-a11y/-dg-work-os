'use client';

import { useEffect, useState } from 'react';
import { X, FileText } from 'lucide-react';
import { guyanaToday, addDays } from '@/lib/airstrip-types';

const inputClass = 'w-full bg-navy-950 border border-navy-800 rounded-lg px-3 py-2 text-sm text-white focus:border-gold-500 focus:outline-none';

export default function GenerateReportModal({ open, onClose, airstripId }: {
  open: boolean; onClose: () => void; airstripId: string;
}) {
  const today = guyanaToday();
  const [from, setFrom] = useState(addDays(today, -365));
  const [to, setTo] = useState(today);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [open, onClose]);

  if (!open) return null;

  function download() {
    const params = new URLSearchParams({ from, to });
    window.open(`/api/airstrips/${airstripId}/report.pdf?${params}`, '_blank');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card-premium w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-gold-500" />
            <h2 className="text-sm font-semibold text-white">Generate Report</h2>
          </div>
          <button onClick={onClose} className="text-navy-600 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">From</label>
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">To</label>
            <input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} className={inputClass} />
          </div>
          <p className="text-[11px] text-navy-600">Defaults to the last 12 months. Includes profile, health, maintenance timeline with photos, and inspections.</p>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
            <button onClick={download} className="btn-gold px-4 py-2 text-sm flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
