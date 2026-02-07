'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

const AGENCY_NAMES: Record<string, string> = {
  GPL: 'Guyana Power & Light',
  GWI: 'Guyana Water Inc.',
  HECI: 'Hinterland Electrification Company Inc.',
  CJIA: 'Cheddi Jagan International Airport',
  MARAD: 'Maritime Administration Department',
  GCAA: 'Guyana Civil Aviation Authority',
  MOPUA: 'Ministry of Public Works',
  HAS: 'Harbour & Aviation Services',
};

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

function fmtRegion(code: string | null): string {
  if (!code) return '-';
  const n = parseInt(code, 10);
  return isNaN(n) ? code : `Region ${n}`;
}

function statusVariant(status: string): 'success' | 'danger' | 'info' | 'default' {
  if (status === 'Complete') return 'success';
  if (status === 'Delayed') return 'danger';
  if (status === 'In Progress') return 'info';
  return 'default';
}

function computeStatus(pct: number, endDate: string | null): string {
  if (pct >= 100) return 'Complete';
  if (pct > 0 && endDate && new Date(endDate) < new Date()) return 'Delayed';
  if (pct > 0) return 'In Progress';
  return 'Not Started';
}

export default function AgencyPage() {
  const params = useParams();
  const agency = params.agency as string;
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects?agency=${agency}`)
      .then(r => r.json())
      .then(d => setProjects((d || []).map((p: any) => ({ ...p, status: computeStatus(p.completion_pct || 0, p.project_end_date) }))))
      .finally(() => setLoading(false));
  }, [agency]);

  const filtered = statusFilter ? projects.filter(p => p.status === statusFilter) : projects;
  const stats = {
    total: projects.length,
    inProgress: projects.filter(p => p.status === 'In Progress').length,
    delayed: projects.filter(p => p.status === 'Delayed').length,
    complete: projects.filter(p => p.status === 'Complete').length,
    totalValue: projects.reduce((s, p) => s + (Number(p.contract_value) || 0), 0),
  };

  const tabs = [
    { key: '', label: 'All', count: stats.total },
    { key: 'In Progress', label: 'In Progress', count: stats.inProgress },
    { key: 'Delayed', label: 'Delayed', count: stats.delayed },
    { key: 'Complete', label: 'Complete', count: stats.complete },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-4">
        <Link href="/projects" className="p-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] transition-colors mt-1">
          <ArrowLeft className="h-5 w-5 text-[#94a3b8]" />
        </Link>
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#d4af37] to-[#b8860b] flex items-center justify-center">
              <Building2 className="h-6 w-6 text-[#0a1628]" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{agency}</h1>
              <p className="text-[#64748b]">{AGENCY_NAMES[agency] || agency}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card-premium p-5"><p className="stat-number">{stats.total}</p><p className="text-[#64748b] text-sm mt-1">Total</p></div>
        <div className="card-premium p-5"><p className="stat-number">{stats.inProgress}</p><p className="text-[#64748b] text-sm mt-1">In Progress</p></div>
        <div className="card-premium p-5"><p className="stat-number text-red-400">{stats.delayed}</p><p className="text-[#64748b] text-sm mt-1">Delayed</p></div>
        <div className="card-premium p-5"><p className="stat-number text-emerald-400">{stats.complete}</p><p className="text-[#64748b] text-sm mt-1">Complete</p></div>
        <div className="card-premium p-5"><p className="stat-number">{fmtCurrency(stats.totalValue)}</p><p className="text-[#64748b] text-sm mt-1">Total Value</p></div>
      </div>

      <div className="flex gap-2 border-b border-[#2d3a52] overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`px-4 py-3 font-medium border-b-2 transition-colors whitespace-nowrap ${statusFilter === t.key ? 'border-[#d4af37] text-[#d4af37]' : 'border-transparent text-[#64748b] hover:text-white'}`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[#64748b]">No projects found</div>
      ) : (
        <div className="space-y-3">
          {filtered.sort((a: any, b: any) => (Number(b.contract_value) || 0) - (Number(a.contract_value) || 0)).map((p: any) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card-premium p-5 block hover:border-[#d4af37]/50">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                    <span className="text-[#64748b] text-xs">{fmtRegion(p.region)}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-white truncate">{p.project_name}</h3>
                  <p className="text-[#94a3b8] mt-1">{p.contractor || 'No contractor assigned'}</p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-xl font-bold text-[#d4af37]">{fmtCurrency(p.contract_value)}</p>
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <div className="w-20 bg-[#2d3a52] rounded-full h-2">
                      <div className="progress-gold h-2 rounded-full" style={{ width: `${Math.min(p.completion_pct || 0, 100)}%` }} />
                    </div>
                    <span className="text-sm font-medium text-white">{p.completion_pct || 0}%</span>
                  </div>
                  <p className="text-[#64748b] text-xs mt-1">End: {fmtDate(p.project_end_date)}</p>
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
