'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Building2, Search, RefreshCw, ChevronUp, ChevronDown,
  PlaneLanding, ChevronLeft, ChevronRight, MapPinned,
} from 'lucide-react';
import {
  STATUS_CONFIG, WATER_STATUSES, WATER_SOURCE_TYPE_LABELS,
} from '@/lib/hinterland-types';
import type { CommunityListRow, CommunitySummary } from '@/lib/hinterland-types';
import { StatusBadge, CoverageBar, StackedStatusBar } from '@/components/hinterland/ui';

interface ListResponse {
  communities: CommunityListRow[];
  summary: CommunitySummary;
  filters: { regions: number[] };
}

type SortField = 'name' | 'region' | 'population' | 'coverage' | 'status';

const PAGE_SIZE = 15;

// ── KPI tile — click to filter by status ──────────────────────────────────────

function KpiTile({ label, value, sub, color, active, onClick }: {
  label: string; value: string | number; sub?: string; color: string; active?: boolean; onClick?: () => void;
}) {
  const content = (
    <>
      <span className="text-navy-600 text-[11px] font-medium uppercase tracking-wide truncate">{label}</span>
      <span className="stat-number text-2xl" style={{ color }}>{value}</span>
      {sub && <span className="text-navy-600 text-[11px] truncate">{sub}</span>}
    </>
  );
  if (!onClick) {
    return <div className="glass-card p-4 flex flex-col gap-1 min-w-0">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`glass-card p-4 flex flex-col gap-1 min-w-0 text-left transition-all ${active ? 'ring-2 ring-gold-500/60' : 'ring-1 ring-transparent hover:ring-navy-700'}`}
    >
      {content}
    </button>
  );
}

function SortHeader({ label, field, currentSort, currentDir, onSort, className }: {
  label: string; field: SortField; currentSort: string; currentDir: string; onSort: (f: SortField) => void; className?: string;
}) {
  const active = currentSort === field;
  return (
    <button onClick={() => onSort(field)} className={`flex items-center gap-1 group ${className ?? ''}`}>
      <span className={active ? 'text-gold-500' : ''}>{label}</span>
      <span className="flex flex-col -space-y-1.5">
        <ChevronUp className={`h-3 w-3 ${active && currentDir === 'asc' ? 'text-gold-500' : 'text-navy-700 group-hover:text-navy-600'}`} />
        <ChevronDown className={`h-3 w-3 ${active && currentDir === 'desc' ? 'text-gold-500' : 'text-navy-700 group-hover:text-navy-600'}`} />
      </span>
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function HinterlandCommunitiesPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [sort, setSort] = useState<SortField>('name');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hinterland/communities');
      if (!res.ok) throw new Error('Failed to fetch');
      setData(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const all = useMemo<CommunityListRow[]>(() => data?.communities ?? [], [data]);
  const summary = data?.summary;
  const regions = data?.filters?.regions ?? [];

  // Source types actually present in the data (only Region 9 today).
  const sourceTypeOptions = useMemo(() => {
    const set = new Set<string>();
    all.forEach(r => r.source_types.forEach(t => set.add(t)));
    return [...set].sort();
  }, [all]);

  function handleSort(field: SortField) {
    if (sort === field) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(field); setDir(field === 'name' ? 'asc' : 'desc'); }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = all.filter(r => {
      if (q && !`${r.name} ${r.sub_district ?? ''} ${r.remarks ?? ''}`.toLowerCase().includes(q)) return false;
      if (region && r.region !== Number(region)) return false;
      if (status && r.water_status !== status) return false;
      if (sourceType && !r.source_types.includes(sourceType)) return false;
      return true;
    });
    const dirMul = dir === 'asc' ? 1 : -1;
    const val = (r: CommunityListRow): string | number => {
      switch (sort) {
        case 'region': return r.region;
        case 'population': return r.population ?? -1;
        case 'coverage': return r.coverage_percent ?? -1;
        case 'status': return WATER_STATUSES.indexOf(r.water_status);
        case 'name':
        default: return r.name.toLowerCase();
      }
    };
    rows = [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -1 * dirMul;
      if (va > vb) return 1 * dirMul;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [all, search, region, status, sourceType, sort, dir]);

  const resultKey = `${search}|${region}|${status}|${sourceType}|${sort}|${dir}`;
  useEffect(() => { setPage(1); }, [resultKey]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const hasFilters = !!(search || region || status || sourceType);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gold-500/20 flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 md:h-5 md:w-5 text-gold-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-white">Hinterland Communities</h1>
            <p className="text-navy-600 text-xs md:text-sm truncate">
              {summary ? `${summary.total} communities across ${summary.regions.length} regions` : 'Loading…'}
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-navy-900 border border-navy-800 hover:border-gold-500 text-slate-400 hover:text-white transition-colors shrink-0"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline text-sm">Refresh</span>
        </button>
      </div>

      {error && (
        <div className="card-premium p-8 text-center">
          <p className="text-red-400 mb-3">{error}</p>
          <button onClick={fetchData} className="btn-navy px-4 py-2 text-sm">Retry</button>
        </div>
      )}

      {/* KPI bento — click a status tile to filter */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiTile label="Total" value={summary.total} sub="communities" color="#94a3b8"
            active={status === ''} onClick={() => setStatus('')} />
          <KpiTile label="Adequate" value={summary.by_status.adequate} sub="water supply" color={STATUS_CONFIG.adequate.color}
            active={status === 'adequate'} onClick={() => setStatus('adequate')} />
          <KpiTile label="Partial" value={summary.by_status.partial} sub="issues / gaps" color={STATUS_CONFIG.partial.color}
            active={status === 'partial'} onClick={() => setStatus('partial')} />
          <KpiTile label="No system" value={summary.by_status.no_system} sub="no supply" color={STATUS_CONFIG.no_system.color}
            active={status === 'no_system'} onClick={() => setStatus('no_system')} />
          <KpiTile label="Unfunded" value={summary.by_status.unfunded} sub="awaiting funding" color={STATUS_CONFIG.unfunded.color}
            active={status === 'unfunded'} onClick={() => setStatus('unfunded')} />
          <KpiTile label="Avg coverage" value={summary.avg_coverage != null ? `${summary.avg_coverage}%` : 'n/a'} sub="where recorded" color="#d4af37" />
        </div>
      )}

      {/* Region-aggregation panel — stands in for the map until geocoding */}
      {/* TODO: point map after geocoding (latitude/longitude are NULL in the register) */}
      {summary && summary.regions.length > 0 && (
        <div className="card-premium p-4 md:p-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPinned className="h-4 w-4 text-gold-500" />
            <h2 className="text-sm font-semibold text-white">Water status by region</h2>
            <span className="text-xs text-navy-600 hidden sm:inline">rollup stands in for a map until communities are geocoded</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {summary.regions.map(r => {
              const active = region === String(r.region);
              return (
                <button
                  key={r.region}
                  type="button"
                  onClick={() => setRegion(active ? '' : String(r.region))}
                  aria-pressed={active}
                  className={`rounded-xl border p-3 text-left transition-all ${active ? 'border-gold-500/60 bg-gold-500/5' : 'border-navy-800 bg-navy-900/40 hover:border-navy-700'}`}
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-sm font-semibold text-white">Region {r.region}</span>
                    <span className="text-xs text-navy-600 font-mono tabular-nums">{r.total}</span>
                  </div>
                  <StackedStatusBar counts={r.by_status} config={STATUS_CONFIG} order={WATER_STATUSES} />
                  <div className="mt-2 text-[11px] text-navy-600">
                    avg coverage <span className="text-slate-300 font-mono">{r.avg_coverage != null ? `${r.avg_coverage}%` : 'n/a'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-600" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search communities..."
            aria-label="Search communities"
            className="input-premium w-full pl-9 pr-3 py-2 rounded-xl bg-navy-950 border border-navy-800 text-white text-sm placeholder:text-navy-600 focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 transition-colors"
          />
        </div>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="input-premium px-3 py-2 rounded-xl bg-navy-950 border border-navy-800 text-sm text-white focus:border-gold-500 transition-colors"
          aria-label="Filter by water status"
        >
          <option value="">All Statuses</option>
          {WATER_STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
        </select>
        <select
          value={region}
          onChange={e => setRegion(e.target.value)}
          className="input-premium px-3 py-2 rounded-xl bg-navy-950 border border-navy-800 text-sm text-white focus:border-gold-500 transition-colors"
          aria-label="Filter by region"
        >
          <option value="">All Regions</option>
          {regions.map(r => <option key={r} value={r}>Region {r}</option>)}
        </select>
        {sourceTypeOptions.length > 0 && (
          <select
            value={sourceType}
            onChange={e => setSourceType(e.target.value)}
            className="input-premium px-3 py-2 rounded-xl bg-navy-950 border border-navy-800 text-sm text-white focus:border-gold-500 transition-colors"
            aria-label="Filter by water source type"
          >
            <option value="">All Source Types</option>
            {sourceTypeOptions.map(t => <option key={t} value={t}>{WATER_SOURCE_TYPE_LABELS[t] ?? t}</option>)}
          </select>
        )}
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setRegion(''); setStatus(''); setSourceType(''); }}
            className="btn-navy px-3 py-2 text-xs"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card-premium p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-premium min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs"><SortHeader label="Community" field="name" currentSort={sort} currentDir={dir} onSort={handleSort} /></th>
                <th className="px-3 py-3 text-left text-xs"><SortHeader label="Region" field="region" currentSort={sort} currentDir={dir} onSort={handleSort} /></th>
                <th className="px-3 py-3 text-left text-xs hidden md:table-cell">Sub-district</th>
                <th className="px-3 py-3 text-right text-xs hidden sm:table-cell"><SortHeader label="Population" field="population" currentSort={sort} currentDir={dir} onSort={handleSort} className="justify-end w-full" /></th>
                <th className="px-3 py-3 text-left text-xs"><SortHeader label="Water" field="status" currentSort={sort} currentDir={dir} onSort={handleSort} /></th>
                <th className="px-3 py-3 text-left text-xs"><SortHeader label="Coverage" field="coverage" currentSort={sort} currentDir={dir} onSort={handleSort} /></th>
                <th className="px-3 py-3 text-center text-xs">Airstrip</th>
              </tr>
            </thead>
            <tbody>
              {loading && all.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-t border-navy-800/40">
                    <td colSpan={7} className="px-4 py-3"><div className="h-5 rounded bg-navy-900/60 animate-pulse" /></td>
                  </tr>
                ))
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-navy-600 text-sm">No communities match the current filters.</td></tr>
              ) : (
                pageRows.map(r => (
                  <tr key={r.id} className="border-t border-navy-800/40 hover:bg-navy-900/40 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link href={`/hinterland-communities/${r.id}`} className="text-sm text-white hover:text-gold-500 transition-colors font-medium">
                        {r.name}
                      </Link>
                      {r.water_source_count > 0 && (
                        <span className="ml-2 text-[10px] text-navy-600">{r.water_source_count} source{r.water_source_count !== 1 ? 's' : ''}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-400">R{r.region}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-400 hidden md:table-cell max-w-[180px] truncate">{r.sub_district || '—'}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-300 text-right font-mono tabular-nums hidden sm:table-cell">{r.population != null ? r.population.toLocaleString() : '—'}</td>
                    <td className="px-3 py-2.5"><StatusBadge value={r.water_status} config={STATUS_CONFIG} /></td>
                    <td className="px-3 py-2.5"><CoverageBar value={r.coverage_percent} /></td>
                    <td className="px-3 py-2.5 text-center">
                      {r.has_airstrip
                        ? <PlaneLanding className="h-4 w-4 text-gold-500 mx-auto" aria-label="Linked airstrip" />
                        : <span className="text-navy-700" aria-label="No airstrip linked">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {visible.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-navy-800/40">
            <span className="text-xs text-navy-600">
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, visible.length)} of {visible.length}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="p-1.5 rounded-lg text-navy-600 hover:text-white hover:bg-navy-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors" aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-slate-400 px-2 tabular-nums">{currentPage} / {pageCount}</span>
              <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={currentPage === pageCount}
                className="p-1.5 rounded-lg text-navy-600 hover:text-white hover:bg-navy-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors" aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
