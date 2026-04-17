'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Award, Search } from 'lucide-react';
import { AgencyBadge } from '@/components/procurement/AgencyBadge';
import { ProcurementDetailPanel } from '@/components/procurement/ProcurementDetailPanel';
import { SELECTABLE_AGENCIES } from '@/lib/constants/agencies';
import { fmtDate } from '@/lib/format';
import type { Tender } from '@/lib/tender/types';

function ArchiveInner() {
  const searchParams = useSearchParams();
  const since = searchParams?.get('since') ?? null;

  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [agencyFilter, setAgencyFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = since ? `?since=${encodeURIComponent(since)}` : '';
    const res = await fetch(`/api/procurement/archive${qs}`);
    if (res.ok) {
      const data = await res.json();
      setTenders(data.tenders || []);
    }
    setLoading(false);
  }, [since]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let out = tenders;
    if (agencyFilter) out = out.filter((t) => t.agency.toUpperCase() === agencyFilter.toUpperCase());
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.contractor?.toLowerCase().includes(q) ||
          t.programme_activity?.toLowerCase().includes(q),
      );
    }
    return out;
  }, [tenders, agencyFilter, search]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/procurement" className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
            <Award className="h-5 w-5 text-emerald-400" /> Awarded Archive
          </h1>
          <p className="text-xs md:text-sm text-navy-600">
            {since ? (
              <>Tenders awarded since <span className="text-emerald-300">{fmtDate(since)}</span></>
            ) : (
              <>All awarded tenders, newest first</>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setAgencyFilter('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              agencyFilter === '' ? 'bg-gold-500/20 text-gold-500 border-gold-500/30' : 'bg-navy-900 text-navy-600 border-navy-800 hover:text-white'
            }`}
          >
            All
          </button>
          {SELECTABLE_AGENCIES.map((a) => (
            <button
              key={a}
              onClick={() => setAgencyFilter(agencyFilter === a ? '' : a)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                agencyFilter === a ? 'bg-gold-500/20 text-gold-500 border-gold-500/30' : 'bg-navy-900 text-navy-600 border-navy-800 hover:text-white'
              }`}
            >
              {a === 'HINTERLAND_AIRSTRIPS' ? 'Airstrips' : a}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-navy-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description / contractor…"
            className="pl-8 pr-3 py-1.5 bg-navy-900 border border-navy-800 rounded-lg text-xs text-white placeholder:text-navy-600 focus:outline-none focus:border-gold-500/40 w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="h-20 bg-navy-900 rounded-xl border border-navy-800 animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-navy-800 bg-navy-900/40 p-10 text-center">
          <Award className="h-8 w-8 text-navy-700 mx-auto mb-2" />
          <p className="text-sm text-navy-600">
            {since ? 'No tenders were awarded since the previous upload.' : 'No awarded tenders on file.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-navy-800 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(26, 39, 68, 0.7) 0%, rgba(10, 22, 40, 0.85) 100%)' }}>
          <div className="grid grid-cols-[1fr_130px_120px_160px_130px] border-b border-navy-800/70 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-navy-600" style={{ background: 'rgba(20, 32, 56, 0.95)' }}>
            <div>Tender</div>
            <div>Activity</div>
            <div>Agency</div>
            <div>Contractor</div>
            <div>Awarded at</div>
          </div>
          <div className="divide-y divide-navy-800/30">
            {filtered.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedTenderId(t.id)}
                className="grid grid-cols-[1fr_130px_120px_160px_130px] items-center cursor-pointer hover:bg-white/[0.03] border-l-2 border-l-transparent hover:border-l-gold-500 transition-colors"
                style={{ minHeight: 44 }}
              >
                <div className="px-3 py-2.5">
                  <p className="text-sm text-white font-medium line-clamp-1">{t.description}</p>
                  {t.date_of_award && (
                    <p className="text-[11px] text-navy-600 mt-0.5">PSIP col-I date: {fmtDate(t.date_of_award)}</p>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <span className="text-xs text-slate-400 line-clamp-1" title={t.programme_activity || ''}>
                    {t.programme_activity || <span className="text-[#3d4a62]">—</span>}
                  </span>
                </div>
                <div className="px-3 py-2.5"><AgencyBadge agency={t.agency} /></div>
                <div className="px-3 py-2.5 text-xs text-slate-300 line-clamp-1" title={t.contractor || ''}>
                  {t.contractor || <span className="text-navy-600">—</span>}
                </div>
                <div className="px-3 py-2.5">
                  <span className="text-xs text-emerald-300">{t.awarded_at ? fmtDate(t.awarded_at) : '—'}</span>
                  {t.first_appearance_already_awarded && (
                    <div className="text-[10px] text-navy-600" title="Tender was already awarded on first PSIP ingest — true transition date unknown">inherited</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ProcurementDetailPanel
        tenderId={selectedTenderId}
        isOpen={!!selectedTenderId}
        onClose={() => setSelectedTenderId(null)}
      />
    </div>
  );
}

export default function ArchivePage() {
  return (
    <Suspense fallback={<div className="h-20 bg-navy-900 rounded-xl border border-navy-800 animate-pulse" />}>
      <ArchiveInner />
    </Suspense>
  );
}
