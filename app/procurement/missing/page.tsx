'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, EyeOff, RotateCcw, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import type { Tender } from '@/lib/tender/types';
import { AgencyBadge } from '@/components/procurement/AgencyBadge';
import { ProcurementStageBadge } from '@/components/procurement/ProcurementStageBadge';

export default function MissingPage() {
  const { toast } = useToast();
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/procurement/missing');
    if (res.ok) {
      const data = await res.json();
      setTenders(data.tenders || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (tenderId: string, action: 'resurrect' | 'archive') => {
    const res = await fetch('/api/procurement/missing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tender_id: tenderId, action }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Failed');
      return;
    }
    toast.success(action === 'resurrect' ? 'Tender resurrected' : 'Tender archived');
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
            <EyeOff className="h-5 w-5 text-gold-500" /> Missing Tenders
          </h1>
          <p className="text-xs md:text-sm text-navy-600">PSIP rows not present in the last applied upload. Resurrect if they reappear, or archive if they’re dead.</p>
        </div>
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
            <div key={t.id} className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{t.description}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <AgencyBadge agency={t.agency} />
                  <ProcurementStageBadge stage={t.stage} size="sm" />
                  <span className="text-[10px] text-navy-600">last seen {new Date(t.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
              <button onClick={() => act(t.id, 'resurrect')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors">
                <RotateCcw className="h-3 w-3" /> Resurrect
              </button>
              <button onClick={() => act(t.id, 'archive')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors">
                <Trash2 className="h-3 w-3" /> Archive
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
