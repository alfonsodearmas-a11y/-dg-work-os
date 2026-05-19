'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, AlertTriangle, TrendingUp, ChevronRight, X } from 'lucide-react';
import { fmtCurrency, fmtDate } from '@/lib/format';
import { Spinner } from '@/components/ui/Spinner';
import { AGENCY_NAMES_SHORT } from '@/lib/constants/agencies';

export default function DelayedProjectsPage() {
  const searchParams = useSearchParams();
  // Bento "View all" deep-link from /intel/[agency] arrives as
  // `?agency=GPL` (canonical UPPERCASE per migration 106). Forward to the
  // API so the scoping happens server-side instead of in-memory.
  const agency = searchParams.get('agency');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = agency ? `/api/projects/delayed?agency=${encodeURIComponent(agency)}` : '/api/projects/delayed';
    fetch(url)
      .then(r => r.json())
      .then(d => setProjects(d || []))
      .finally(() => setLoading(false));
  }, [agency]);

  const agencyDisplay = agency ? (AGENCY_NAMES_SHORT[agency] ?? agency) : null;

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-4">
        <Link href="/projects" className="p-2 rounded-lg bg-navy-900 border border-navy-800 hover:border-gold-500 transition-colors mt-1" aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-slate-400" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-red-400" />
            Delayed Projects
          </h1>
          <p className="text-navy-600 mt-1">
            {projects.length} projects past their deadline
            {agencyDisplay ? <span> · scoped to <span className="text-white">{agencyDisplay}</span></span> : null}
          </p>
          {agencyDisplay ? (
            <Link
              href="/projects/delayed"
              className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-xs font-medium bg-gold-500/15 text-gold-500 border border-gold-500/30 hover:bg-gold-500/25 transition-colors"
              aria-label="Clear agency filter"
            >
              {agencyDisplay} <X className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Spinner />
        </div>
      ) : projects.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="h-8 w-8 text-emerald-400" />
          </div>
          <p className="text-white font-medium">No delayed projects</p>
          <p className="text-navy-600 text-sm mt-1">All projects are on track</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p: any) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card-premium p-5 block hover:border-gold-500/50 transition-all">
              <div className="flex flex-col md:flex-row items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-3 mb-2">
                    <span className="px-3 py-1 rounded-lg text-sm font-bold bg-gradient-to-r from-[#d4af37] to-[#b8860b] text-navy-950">
                      {p.sub_agency || 'MOPUA'}
                    </span>
                    <span className="px-3 py-1 rounded-lg text-sm font-medium bg-red-500/20 text-red-400">
                      {p.days_overdue} days overdue
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white">{p.project_name}</h3>
                  <p className="text-slate-400 mt-1">{p.contractor || 'No contractor assigned'}</p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-xl font-bold text-gold-500">{fmtCurrency(p.contract_value)}</p>
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <div className="w-20 bg-navy-800 rounded-full h-2">
                      <div className="bg-red-500 h-2 rounded-full" style={{ width: `${Math.min(p.completion_pct || 0, 100)}%` }} />
                    </div>
                    <span className="text-sm font-medium text-red-400">{p.completion_pct || 0}%</span>
                  </div>
                  <p className="text-navy-600 text-xs mt-1">Due: {fmtDate(p.project_end_date)}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-navy-600 ml-4 shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
