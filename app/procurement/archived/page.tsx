'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Archive as ArchiveIcon, RotateCcw } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/components/providers/SupabaseSessionProvider';
import type { Tender } from '@/lib/tender/types';
import { ARCHIVE_REASON_LABELS, type ArchiveReasonCode } from '@/lib/tender/types';
import { AgencyBadge } from '@/components/procurement/AgencyBadge';
import { ProcurementStageBadge } from '@/components/procurement/ProcurementStageBadge';

export default function ArchivedPage() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);

  const isDg = session?.user?.role === 'dg';

  const load = useCallback(async () => {
    const res = await fetch('/api/procurement/archived');
    if (res.ok) {
      const data = await res.json();
      setTenders(data.tenders || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const unarchive = async (tenderId: string) => {
    const res = await fetch('/api/procurement/archived', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tender_id: tenderId, action: 'unarchive' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Failed');
      return;
    }
    toast.success('Tender unarchived');
    setTenders((prev) => prev.filter((t) => t.id !== tenderId));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/procurement" className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
            <ArchiveIcon className="h-5 w-5 text-gold-500" /> Archived Tenders
          </h1>
          <p className="text-xs md:text-sm text-navy-600">
            Tenders soft-archived from active surfaces. {isDg ? 'You can unarchive any row.' : 'DG can unarchive.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-20 bg-navy-900 rounded-xl border border-navy-800 animate-pulse" />
      ) : tenders.length === 0 ? (
        <div className="rounded-xl border border-navy-800 bg-navy-900/40 p-10 text-center">
          <p className="text-sm text-navy-600">No archived tenders.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tenders.map((t) => (
            <div key={t.id} className="rounded-xl border border-navy-800 bg-navy-900/40 p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{t.description}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <AgencyBadge agency={t.agency} />
                  <ProcurementStageBadge stage={t.stage} size="sm" />
                  {t.archive_reason_code && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-navy-800 text-navy-400 border border-navy-700">
                      {ARCHIVE_REASON_LABELS[t.archive_reason_code as ArchiveReasonCode]}
                    </span>
                  )}
                  <span className="text-[10px] text-navy-600">
                    archived {t.archived_at ? new Date(t.archived_at).toLocaleDateString() : '—'}
                  </span>
                </div>
                {t.archive_reason_text && (
                  <p className="text-[11px] text-navy-500 mt-1 italic truncate">{t.archive_reason_text}</p>
                )}
              </div>
              {isDg && (
                <button
                  onClick={() => unarchive(t.id)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                >
                  <RotateCcw className="h-3 w-3" /> Unarchive
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
