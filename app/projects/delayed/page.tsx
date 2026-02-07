'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, TrendingUp, ChevronRight } from 'lucide-react';

function fmtCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '-') return '-';
  const num = typeof value === 'string' ? parseFloat(value.replace(/[$,]/g, '')) : Number(value);
  if (isNaN(num)) return '-';
  const abs = Math.abs(num);
  if (abs >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
  return `$${num.toLocaleString()}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DelayedProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects/delayed')
      .then(r => r.json())
      .then(d => setProjects(d || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-4">
        <Link href="/projects" className="p-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] transition-colors mt-1">
          <ArrowLeft className="h-5 w-5 text-[#94a3b8]" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-red-400" />
            Delayed Projects
          </h1>
          <p className="text-[#64748b] mt-1">{projects.length} projects past their deadline</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="h-8 w-8 text-emerald-400" />
          </div>
          <p className="text-white font-medium">No delayed projects</p>
          <p className="text-[#64748b] text-sm mt-1">All projects are on track</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p: any) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card-premium p-5 block hover:border-[#d4af37]/50 transition-all">
              <div className="flex flex-col md:flex-row items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-3 mb-2">
                    <span className="px-3 py-1 rounded-lg text-sm font-bold bg-gradient-to-r from-[#d4af37] to-[#b8860b] text-[#0a1628]">
                      {p.sub_agency || 'MOPUA'}
                    </span>
                    <span className="px-3 py-1 rounded-lg text-sm font-medium bg-red-500/20 text-red-400">
                      {p.days_overdue} days overdue
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white">{p.project_name}</h3>
                  <p className="text-[#94a3b8] mt-1">{p.contractor || 'No contractor assigned'}</p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-xl font-bold text-[#d4af37]">{fmtCurrency(p.contract_value)}</p>
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <div className="w-20 bg-[#2d3a52] rounded-full h-2">
                      <div className="bg-red-500 h-2 rounded-full" style={{ width: `${Math.min(p.completion_pct || 0, 100)}%` }} />
                    </div>
                    <span className="text-sm font-medium text-red-400">{p.completion_pct || 0}%</span>
                  </div>
                  <p className="text-[#64748b] text-xs mt-1">Due: {fmtDate(p.project_end_date)}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-[#64748b] ml-4 shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
