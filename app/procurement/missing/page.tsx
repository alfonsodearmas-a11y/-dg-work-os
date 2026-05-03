'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, EyeOff, RotateCcw, Trash2, Archive as ArchiveIcon } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import type { Tender } from '@/lib/tender/types';
import { ARCHIVE_REASON_CODES, ARCHIVE_REASON_LABELS, type ArchiveReasonCode } from '@/lib/tender/types';
import { AgencyBadge } from '@/components/procurement/AgencyBadge';
import { ProcurementStageBadge } from '@/components/procurement/ProcurementStageBadge';

export default function MissingPage() {
  const { toast } = useToast();
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState<string | null>(null); // tenderId currently in the reason picker
  const [reason, setReason] = useState<ArchiveReasonCode>('withdrawn');
  const [reasonText, setReasonText] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/procurement/missing');
    if (res.ok) {
      const data = await res.json();
      setTenders(data.tenders || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resurrect = async (tenderId: string) => {
    const res = await fetch('/api/procurement/missing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tender_id: tenderId, action: 'resurrect' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Failed');
      return;
    }
    toast.success('Tender resurrected');
    setTenders((prev) => prev.filter((t) => t.id !== tenderId));
  };

  const confirmArchive = async () => {
    if (!archiving) return;
    const res = await fetch('/api/procurement/missing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tender_id: archiving,
        action: 'archive',
        reason_code: reason,
        reason_text: reasonText.trim() || null,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Failed');
      return;
    }
    toast.success('Tender archived');
    setTenders((prev) => prev.filter((t) => t.id !== archiving));
    setArchiving(null);
    setReason('withdrawn');
    setReasonText('');
  };

  const cancelArchive = () => {
    setArchiving(null);
    setReason('withdrawn');
    setReasonText('');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/procurement" className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
            <EyeOff className="h-5 w-5 text-gold-500" /> Missing Tenders
          </h1>
          <p className="text-xs md:text-sm text-navy-600">PSIP rows not present in the last applied upload. Resurrect if they reappear, or archive with a reason.</p>
        </div>
        <Link href="/procurement/archived" className="text-xs text-navy-600 hover:text-white transition-colors flex items-center gap-1">
          <ArchiveIcon className="h-3.5 w-3.5" /> Archived
        </Link>
      </div>

      {loading ? (
        <div className="h-20 bg-navy-900 rounded-xl border border-navy-800 animate-pulse" />
      ) : tenders.length === 0 ? (
        <div className="rounded-xl border border-navy-800 bg-navy-900/40 p-10 text-center">
          <p className="text-sm text-navy-600">No tenders are missing.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tenders.map((t) => (
            <div key={t.id}>
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{t.description}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <AgencyBadge agency={t.agency} />
                    <ProcurementStageBadge stage={t.stage} size="sm" />
                    <span className="text-[10px] text-navy-600">last seen {new Date(t.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <button onClick={() => resurrect(t.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors">
                  <RotateCcw className="h-3 w-3" /> Resurrect
                </button>
                <button onClick={() => setArchiving(t.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors">
                  <Trash2 className="h-3 w-3" /> Archive…
                </button>
              </div>
              {archiving === t.id && (
                <div className="mt-2 ml-6 mr-2 rounded-xl border border-red-500/30 bg-navy-900 p-4 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-white mb-1">Why are you archiving this tender?</p>
                    <p className="text-[11px] text-navy-600">Recorded in the procurement decision log. Tender is hidden from active surfaces but recoverable from /procurement/archived.</p>
                  </div>
                  <div className="space-y-1.5">
                    {ARCHIVE_REASON_CODES.map((code) => (
                      <label key={code} className="flex items-center gap-2 text-xs text-white cursor-pointer">
                        <input
                          type="radio"
                          name={`reason-${t.id}`}
                          value={code}
                          checked={reason === code}
                          onChange={() => setReason(code)}
                          className="accent-gold-500"
                        />
                        {ARCHIVE_REASON_LABELS[code]}
                      </label>
                    ))}
                  </div>
                  <textarea
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    placeholder="Optional note for the audit log…"
                    className="w-full text-xs bg-navy-950 border border-navy-800 rounded-lg p-2 text-white placeholder:text-navy-700 focus:outline-none focus:border-gold-500/50"
                    rows={2}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={cancelArchive} className="px-3 py-1.5 rounded-lg text-xs text-navy-600 hover:text-white transition-colors">
                      Cancel
                    </button>
                    <button onClick={confirmArchive} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors">
                      <Trash2 className="h-3 w-3" /> Confirm archive
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
