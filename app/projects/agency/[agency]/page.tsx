'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { fmtCurrency, fmtDate } from '@/lib/format';
import { AGENCY_NAMES } from '@/lib/constants/agencies';
import { Spinner } from '@/components/ui/Spinner';

function fmtRegion(code: string | null): string {
  if (!code) return '-';
  const n = parseInt(code, 10);
  return isNaN(n) ? code : `Region ${n}`;
}

function statusVariant(status: string): 'success' | 'danger' | 'info' | 'default' | 'warning' {
  if (status === 'Completed') return 'success';
  if (status === 'Delayed') return 'danger';
  if (status === 'Commenced') return 'info';
  if (status === 'Awarded' || status === 'Rollover') return 'warning';
  return 'default';
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
      .then(d => setProjects(d || []))
      .finally(() => setLoading(false));
  }, [agency]);

  const filtered = statusFilter ? projects.filter(p => p.status === statusFilter) : projects;
  const stats = {
    total: projects.length,
    commenced: projects.filter(p => p.status === 'Commenced').length,
    delayed: projects.filter(p => p.status === 'Delayed').length,
    completed: projects.filter(p => p.status === 'Completed').length,
    totalValue: projects.reduce((s, p) => {
      const v = Number(p.contract_value) || 0;
      return s + (v > 1e11 ? 0 : v);
    }, 0),
  };

  const tabs = [
    { key: '', label: 'All', count: stats.total },
    { key: 'Commenced', label: 'Commenced', count: stats.commenced },
    { key: 'Delayed', label: 'Delayed', count: stats.delayed },
    { key: 'Completed', label: 'Completed', count: stats.completed },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-4">
        <Link href="/projects" className="p-2 rounded-lg bg-navy-900 border border-navy-800 hover:border-gold-500 transition-colors mt-1" aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-slate-400" />
        </Link>
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#d4af37] to-[#b8860b] flex items-center justify-center">
              <Building2 className="h-6 w-6 text-navy-950" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{agency}</h1>
              <p className="text-navy-600">{AGENCY_NAMES[agency] || agency}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card-premium p-5"><p className="stat-number">{stats.total}</p><p className="text-navy-600 text-sm mt-1">Total</p></div>
        <div className="card-premium p-5"><p className="stat-number">{stats.commenced}</p><p className="text-navy-600 text-sm mt-1">Commenced</p></div>
        <div className="card-premium p-5"><p className="stat-number text-red-400">{stats.delayed}</p><p className="text-navy-600 text-sm mt-1">Delayed</p></div>
        <div className="card-premium p-5"><p className="stat-number text-emerald-400">{stats.completed}</p><p className="text-navy-600 text-sm mt-1">Completed</p></div>
        <div className="card-premium p-5"><p className="stat-number">{fmtCurrency(stats.totalValue)}</p><p className="text-navy-600 text-sm mt-1">Total Value</p></div>
      </div>

      <div className="flex gap-2 border-b border-navy-800 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`px-4 py-3 font-medium border-b-2 transition-colors whitespace-nowrap ${statusFilter === t.key ? 'border-gold-500 text-gold-500' : 'border-transparent text-navy-600 hover:text-white'}`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-navy-600">No projects found</div>
      ) : (
        <div className="space-y-3">
          {filtered.sort((a: any, b: any) => (Number(b.contract_value) || 0) - (Number(a.contract_value) || 0)).map((p: any) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card-premium p-5 block hover:border-gold-500/50">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                    <span className="text-navy-600 text-xs">{fmtRegion(p.region)}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-white truncate">{p.project_name}</h3>
                  <p className="text-slate-400 mt-1">{p.contractor || 'No contractor assigned'}</p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-xl font-bold text-gold-500">{fmtCurrency(p.contract_value)}</p>
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <div className="w-20 bg-navy-800 rounded-full h-2">
                      <div className="progress-gold h-2 rounded-full" style={{ width: `${Math.min(p.completion_pct || 0, 100)}%` }} />
                    </div>
                    <span className="text-sm font-medium text-white">{p.completion_pct || 0}%</span>
                  </div>
                  <p className="text-navy-600 text-xs mt-1">End: {fmtDate(p.project_end_date)}</p>
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
