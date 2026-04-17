'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, ArrowRight } from 'lucide-react';
import { AgencyBadge } from '@/components/procurement/AgencyBadge';

interface ChangeGroup {
  tender: { id: string; description: string; agency: string; stage: string };
  changes: Array<{ field: string; old: unknown; new: unknown; at: string }>;
}

interface ChangesResponse {
  upload: { id: string; filename: string; applied_at: string | null } | null;
  groups: Record<string, ChangeGroup[]>;
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function ChangesPage() {
  const [data, setData] = useState<ChangesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/procurement/changes');
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/procurement" className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-gold-500" /> What Moved
          </h1>
          <p className="text-xs md:text-sm text-navy-600">
            {data?.upload
              ? <>Changes from <span className="text-white">{data.upload.filename}</span> applied {data.upload.applied_at ? new Date(data.upload.applied_at).toLocaleDateString() : ''}</>
              : <>No applied uploads yet.</>
            }
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-20 bg-navy-900 rounded-xl border border-navy-800 animate-pulse" />
      ) : !data || !data.upload ? (
        <div className="rounded-xl border border-navy-800 bg-navy-900/40 p-10 text-center">
          <p className="text-sm text-navy-600">Once you apply a PSIP upload, the deltas will show up here.</p>
        </div>
      ) : Object.keys(data.groups).length === 0 ? (
        <div className="rounded-xl border border-navy-800 bg-navy-900/40 p-10 text-center">
          <p className="text-sm text-navy-600">No tenders changed in this upload.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(data.groups).map(([agency, tenders]) => (
            <section key={agency}>
              <div className="flex items-center gap-2 mb-2">
                <AgencyBadge agency={agency} />
                <span className="text-xs text-navy-600">{tenders.length} tenders changed</span>
              </div>
              <div className="rounded-xl border border-navy-800 bg-navy-900/40 divide-y divide-navy-800/50">
                {tenders.map(({ tender, changes }) => (
                  <div key={tender.id} className="px-4 py-3">
                    <div className="text-sm text-white mb-1">{tender.description}</div>
                    <div className="space-y-1">
                      {changes.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-navy-600 w-20 shrink-0">{c.field === '__created' ? 'created' : c.field === '__presence' ? 'presence' : c.field}</span>
                          {c.field !== '__created' && (
                            <>
                              <span className="text-navy-600 line-through">{fmtValue(c.old)}</span>
                              <ArrowRight className="h-3 w-3 text-navy-600" />
                            </>
                          )}
                          <span className="text-white">{fmtValue(c.new)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
