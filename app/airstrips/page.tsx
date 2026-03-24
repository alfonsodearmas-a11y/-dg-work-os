'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  PlaneLanding, Search, Download, Plus, Upload,
  Check, Minus, ChevronUp, ChevronDown,
  LayoutGrid, List, AlertTriangle, RefreshCw, X, MapPin,
} from 'lucide-react';
import {
  STATUS_CONFIG, CONDITION_CONFIG, FREQUENCY_CONFIG,
  AIRSTRIP_STATUSES, SURFACE_CONDITIONS, FLIGHT_FREQUENCIES,
} from '@/lib/airstrip-types';
import type { Airstrip } from '@/lib/airstrip-types';
import { EmptyState } from '@/components/ui/EmptyState';
import { exportToCsv } from '@/lib/export-csv';
import AddEditAirstripModal from '@/components/airstrips/AddEditAirstripModal';
import BulkUploadAirstripsModal from '@/components/airstrips/BulkUploadAirstripsModal';
import { SlidePanel } from '@/components/layout/SlidePanel';

// ── Types ────────────────────────────────────────────────────────────────────

interface AirstripListSummary {
  total: number;
  operational: number;
  limited_or_rehab: number;
  closed: number;
  overdue_inspection: number;
  pending_verification: number;
}

interface AirstripResponse {
  airstrips: Airstrip[];
  summary: AirstripListSummary;
  filters: { regions: number[] };
}

type SortField = 'name' | 'region' | 'runway_length_m' | 'surface_condition' | 'last_inspection_date' | 'flight_frequency' | 'status';
type ViewMode = 'table' | 'grid';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isOverdue(date: string | null): boolean {
  if (!date) return true;
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return new Date(date) < sixMonthsAgo;
}

function formatRunway(length: number | null, width: number | null): string {
  if (!length && !width) return '—';
  const l = length ? `${length}m` : '?';
  const w = width ? `${width}m` : '?';
  return `${l} × ${w}`;
}

function formatDate(date: string | null): string {
  if (!date) return 'Never';
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function handleExportCsv(airstrips: Airstrip[]) {
  exportToCsv(
    `airstrips-${new Date().toISOString().slice(0, 10)}`,
    airstrips.map(a => ({
      Name: a.name,
      Region: a.region,
      Engineered: a.engineered_structure ? 'Yes' : 'No',
      'Runway Length (m)': a.runway_length_m ?? '',
      'Runway Width (m)': a.runway_width_m ?? '',
      'Surface Type': a.surface_type ?? '',
      Condition: a.surface_condition ?? '',
      'Last Inspection': a.last_inspection_date ?? '',
      'Flight Frequency': a.flight_frequency ?? '',
      Status: a.status,
      Remarks: a.remarks ?? '',
    })),
  );
}

function ConfigBadge({ value, config }: { value: string | null; config: Record<string, { label: string; color: string }> }) {
  if (!value) return <span className="text-navy-600 text-sm">—</span>;
  const cfg = config[value];
  if (!cfg) return <span className="text-sm text-white">{value}</span>;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${cfg.color}20`, color: cfg.color, border: `1px solid ${cfg.color}40` }}
    >
      {cfg.label}
    </span>
  );
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-navy-900/60 border border-navy-800/60 p-3">
      <span className="text-xs text-navy-600 block mb-1">{label}</span>
      {children}
    </div>
  );
}

// ── Summary Stat Card ────────────────────────────────────────────────────────

function StatCard({ label, value, color, pulse }: { label: string; value: number; color: string; pulse?: boolean }) {
  return (
    <div className="glass-card p-4 flex flex-col gap-1 min-w-0">
      <span className={`stat-number text-2xl ${pulse ? 'animate-pulse' : ''}`} style={{ color }}>{value}</span>
      <span className="text-navy-600 text-xs font-medium truncate">{label}</span>
    </div>
  );
}

// ── Sort Header ──────────────────────────────────────────────────────────────

function SortHeader({ label, field, currentSort, currentDir, onSort }: {
  label: string; field: SortField; currentSort: string; currentDir: string; onSort: (f: SortField) => void;
}) {
  const active = currentSort === field;
  return (
    <button onClick={() => onSort(field)} className="flex items-center gap-1 group">
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

export default function AirstripsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── State ──
  const [data, setData] = useState<AirstripResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters (URL-synced)
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [region, setRegion] = useState(() => searchParams.get('region') || '');
  const [status, setStatus] = useState(() => searchParams.get('status') || '');
  const [condition, setCondition] = useState(() => searchParams.get('condition') || '');
  const [frequency, setFrequency] = useState(() => searchParams.get('frequency') || '');
  const [sort, setSort] = useState<SortField>(() => (searchParams.get('sort') as SortField) || 'name');
  const [dir, setDir] = useState(() => searchParams.get('dir') || 'asc');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [selectedAirstripId, setSelectedAirstripId] = useState<string | null>(null);

  // ── URL sync ──
  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (region) p.set('region', region);
    if (status) p.set('status', status);
    if (condition) p.set('condition', condition);
    if (frequency) p.set('frequency', frequency);
    if (sort !== 'name') p.set('sort', sort);
    if (dir !== 'asc') p.set('dir', dir);
    return p;
  }, [search, region, status, condition, frequency, sort, dir]);

  useEffect(() => {
    const str = buildParams().toString();
    if (str !== searchParams.toString()) {
      router.replace(`/airstrips${str ? `?${str}` : ''}`, { scroll: false });
    }
  }, [buildParams, router, searchParams]);

  // ── Fetch ──
  const fetchAirstrips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildParams();
      const res = await fetch(`/api/airstrips?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json: AirstripResponse = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => { fetchAirstrips(); }, [fetchAirstrips]);

  // ── Sort handler ──
  function handleSort(field: SortField) {
    if (sort === field) {
      setDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(field);
      setDir('asc');
    }
  }

  function clearFilters() {
    setSearch(''); setRegion(''); setStatus(''); setCondition(''); setFrequency('');
    setSort('name'); setDir('asc');
  }

  const hasActiveFilters = !!(search || region || status || condition || frequency);

  const airstrips = data?.airstrips || [];
  const summary = data?.summary;
  const availableRegions = data?.filters?.regions || [];
  const distinctSurfaceTypes = React.useMemo(
    () => [...new Set(airstrips.map(a => a.surface_type).filter(Boolean) as string[])].sort(),
    [airstrips],
  );
  const selectedAirstrip = airstrips.find(a => a.id === selectedAirstripId) ?? null;

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gold-500/20 flex items-center justify-center shrink-0">
            <PlaneLanding className="h-4 w-4 md:h-5 md:w-5 text-gold-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-white">Hinterland Airstrips</h1>
            <p className="text-navy-600 text-xs md:text-sm truncate">51 airstrips across 8 regions</p>
          </div>
        </div>
        <button
          onClick={fetchAirstrips}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-navy-900 border border-navy-800 hover:border-gold-500 text-slate-400 hover:text-white transition-colors shrink-0"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline text-sm">Refresh</span>
        </button>
      </div>

      {/* Summary Bar */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Airstrips" value={summary.total} color="#94a3b8" />
          <StatCard label="Operational" value={summary.operational} color="#10b981" />
          <StatCard label="Limited / Rehab" value={summary.limited_or_rehab} color="#d4af37" />
          <StatCard label="Closed" value={summary.closed} color="#dc2626" />
          <StatCard label="Overdue Inspection" value={summary.overdue_inspection} color="#f97316" pulse={summary.overdue_inspection > 0} />
          <StatCard label="Pending Verification" value={summary.pending_verification} color="#60a5fa" />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        {/* Search + Filters row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-600" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search airstrips..."
              className="input-premium w-full pl-9 pr-3 py-2 rounded-xl bg-navy-950 border border-navy-800 text-white text-sm placeholder:text-navy-600 focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 transition-colors"
            />
          </div>

          {/* Region filter */}
          <select
            value={region}
            onChange={e => setRegion(e.target.value)}
            className="input-premium px-3 py-2 rounded-xl bg-navy-950 border border-navy-800 text-sm text-white focus:border-gold-500 transition-colors"
            aria-label="Filter by region"
          >
            <option value="">All Regions</option>
            {availableRegions.map(r => (
              <option key={r} value={r}>Region {r}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="input-premium px-3 py-2 rounded-xl bg-navy-950 border border-navy-800 text-sm text-white focus:border-gold-500 transition-colors"
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            {AIRSTRIP_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>

          {/* Condition filter */}
          <select
            value={condition}
            onChange={e => setCondition(e.target.value)}
            className="input-premium px-3 py-2 rounded-xl bg-navy-950 border border-navy-800 text-sm text-white focus:border-gold-500 transition-colors"
            aria-label="Filter by condition"
          >
            <option value="">All Conditions</option>
            {SURFACE_CONDITIONS.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Frequency filter */}
          <select
            value={frequency}
            onChange={e => setFrequency(e.target.value)}
            className="input-premium px-3 py-2 rounded-xl bg-navy-950 border border-navy-800 text-sm text-white focus:border-gold-500 transition-colors"
            aria-label="Filter by flight frequency"
          >
            <option value="">All Frequencies</option>
            {FLIGHT_FREQUENCIES.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>

          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-navy-600 hover:text-white transition-colors" aria-label="Clear filters">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/30 text-xs text-gold-500">
                {airstrips.length} result{airstrips.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExportCsv(airstrips)}
              disabled={airstrips.length === 0}
              className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button onClick={() => setBulkUploadOpen(true)} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Bulk Upload
            </button>
            <button onClick={() => setAddModalOpen(true)} className="btn-gold px-3 py-1.5 text-xs flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Airstrip
            </button>

            {/* View toggle */}
            <div className="flex items-center gap-0.5 bg-navy-950 border border-navy-800 rounded-lg p-0.5 ml-2">
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-gold-500/20 text-gold-500' : 'text-navy-600 hover:text-white'}`}
                aria-label="Table view"
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'grid' ? 'bg-gold-500/20 text-gold-500' : 'text-navy-600 hover:text-white'}`}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-navy-900/50 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card-premium p-6 text-center">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={fetchAirstrips} className="btn-navy mt-3 px-4 py-2 text-sm">Retry</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && airstrips.length === 0 && (
        <EmptyState
          icon={<PlaneLanding className="h-12 w-12" />}
          title="No airstrips found"
          description={hasActiveFilters ? 'Try adjusting your filters.' : 'Airstrip data has not been loaded yet.'}
          action={hasActiveFilters ? <button onClick={clearFilters} className="btn-navy px-4 py-2 text-sm">Clear Filters</button> : undefined}
        />
      )}

      {/* Table View */}
      {!loading && !error && airstrips.length > 0 && viewMode === 'table' && (
        <div className="overflow-x-auto rounded-xl border border-navy-800">
          <table className="table-premium min-w-full">
            <thead>
              <tr>
                <th className="px-3 py-3 text-left text-xs">
                  <SortHeader label="Airstrip" field="name" currentSort={sort} currentDir={dir} onSort={handleSort} />
                </th>
                <th className="px-3 py-3 text-left text-xs hidden sm:table-cell">
                  <SortHeader label="Region" field="region" currentSort={sort} currentDir={dir} onSort={handleSort} />
                </th>
                <th className="px-3 py-3 text-left text-xs">
                  <SortHeader label="Condition" field="surface_condition" currentSort={sort} currentDir={dir} onSort={handleSort} />
                </th>
                <th className="px-3 py-3 text-left text-xs hidden md:table-cell">
                  <SortHeader label="Last Inspection" field="last_inspection_date" currentSort={sort} currentDir={dir} onSort={handleSort} />
                </th>
                <th className="px-3 py-3 text-left text-xs">
                  <SortHeader label="Status" field="status" currentSort={sort} currentDir={dir} onSort={handleSort} />
                </th>
              </tr>
            </thead>
            <tbody>
              {airstrips.map((a) => {
                const overdue = isOverdue(a.last_inspection_date);
                return (
                  <tr
                    key={a.id}
                    className={`hover:bg-navy-900/40 cursor-pointer transition-colors border-t border-navy-800/40 ${selectedAirstrip?.id === a.id ? 'bg-gold-500/10' : ''}`}
                    onClick={() => setSelectedAirstripId(a.id)}
                  >
                    <td className="px-3 py-2.5">
                      <span className="text-sm font-medium text-white hover:text-gold-500 transition-colors">{a.name}</span>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-navy-800 text-xs font-medium text-white">{a.region}</span>
                    </td>
                    <td className="px-3 py-2.5"><ConfigBadge value={a.surface_condition} config={CONDITION_CONFIG} /></td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <span className={`text-xs ${overdue ? 'text-orange-400' : 'text-slate-400'}`}>
                        {overdue && <AlertTriangle className="inline h-3 w-3 mr-1 -mt-0.5" />}
                        {formatDate(a.last_inspection_date)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5"><ConfigBadge value={a.status} config={STATUS_CONFIG} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Card Grid View */}
      {!loading && !error && airstrips.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {airstrips.map(a => {
            const overdue = isOverdue(a.last_inspection_date);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedAirstripId(a.id)}
                className={`card-premium p-0 overflow-hidden group text-left w-full ${selectedAirstrip?.id === a.id ? 'ring-1 ring-gold-500/50' : ''}`}
              >
                <div className="p-4 space-y-2.5">
                  <h3 className="font-semibold text-white text-sm group-hover:text-gold-500 transition-colors">{a.name}</h3>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-navy-800 text-xs font-medium text-white">
                      Region {a.region}
                    </span>
                    <ConfigBadge value={a.status} config={STATUS_CONFIG} />
                    <ConfigBadge value={a.surface_condition} config={CONDITION_CONFIG} />
                  </div>

                  <div className="text-xs text-slate-400">
                    <span className={overdue ? 'text-orange-400' : ''}>
                      {overdue && <AlertTriangle className="inline h-3 w-3 mr-1 -mt-0.5" />}
                      Inspected: {formatDate(a.last_inspection_date)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail Drawer */}
      <SlidePanel
        isOpen={!!selectedAirstrip}
        onClose={() => setSelectedAirstripId(null)}
        title={selectedAirstrip?.name || ''}
        subtitle={`Region ${selectedAirstrip?.region}`}
        icon={PlaneLanding}
        accentColor="from-gold-500/80 to-amber-600/80"
      >
        {selectedAirstrip && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 flex-wrap">
              <ConfigBadge value={selectedAirstrip.status} config={STATUS_CONFIG} />
              <ConfigBadge value={selectedAirstrip.surface_condition} config={CONDITION_CONFIG} />
              {selectedAirstrip.flight_frequency && <ConfigBadge value={selectedAirstrip.flight_frequency} config={FREQUENCY_CONFIG} />}
            </div>

            {isOverdue(selectedAirstrip.last_inspection_date) && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/30">
                <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0" />
                <span className="text-xs text-orange-400">
                  Inspection overdue — last inspected {formatDate(selectedAirstrip.last_inspection_date)}
                </span>
              </div>
            )}

            {/* Runway & Infrastructure */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-navy-600 uppercase tracking-wider">Runway & Infrastructure</h3>
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Runway">
                  <span className="text-sm text-white font-mono">{formatRunway(selectedAirstrip.runway_length_m, selectedAirstrip.runway_width_m)}</span>
                </DetailField>
                <DetailField label="Surface">
                  <span className="text-sm text-white">{selectedAirstrip.surface_type || '—'}</span>
                </DetailField>
                <DetailField label="Engineered">
                  <span className="text-sm flex items-center gap-1.5">
                    {selectedAirstrip.engineered_structure
                      ? <><Check className="h-3.5 w-3.5 text-emerald-400" /><span className="text-emerald-400">Yes</span></>
                      : <><Minus className="h-3.5 w-3.5 text-navy-600" /><span className="text-navy-600">No</span></>
                    }
                  </span>
                </DetailField>
                <DetailField label="Flight Frequency">
                  <ConfigBadge value={selectedAirstrip.flight_frequency} config={FREQUENCY_CONFIG} />
                </DetailField>
              </div>
            </div>

            {/* Operations */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-navy-600 uppercase tracking-wider">Operations</h3>
              <DetailField label="Last Inspection">
                <span className={`text-sm ${isOverdue(selectedAirstrip.last_inspection_date) ? 'text-orange-400' : 'text-white'}`}>
                  {isOverdue(selectedAirstrip.last_inspection_date) && <AlertTriangle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />}
                  {formatDate(selectedAirstrip.last_inspection_date)}
                </span>
              </DetailField>
            </div>

            {/* Location */}
            {(selectedAirstrip.coordinates_lat != null && selectedAirstrip.coordinates_lon != null) && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-navy-600 uppercase tracking-wider">Location</h3>
                <div className="rounded-xl bg-navy-900/60 border border-navy-800/60 p-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-navy-600 shrink-0" />
                  <span className="text-sm text-slate-400 font-mono">
                    {selectedAirstrip.coordinates_lat?.toFixed(4)}, {selectedAirstrip.coordinates_lon?.toFixed(4)}
                  </span>
                </div>
              </div>
            )}

            {/* Notes */}
            {(selectedAirstrip.remarks || selectedAirstrip.airside_buildings) && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-navy-600 uppercase tracking-wider">Notes</h3>
                {selectedAirstrip.remarks && (
                  <DetailField label="Remarks">
                    <span className="text-sm text-slate-300">{selectedAirstrip.remarks}</span>
                  </DetailField>
                )}
                {selectedAirstrip.airside_buildings && (
                  <DetailField label="Airside Buildings">
                    <span className="text-sm text-slate-300">{selectedAirstrip.airside_buildings}</span>
                  </DetailField>
                )}
              </div>
            )}

            <Link
              href={`/airstrips/${selectedAirstrip.id}`}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-navy-900 border border-navy-800 hover:border-gold-500 text-slate-400 hover:text-white transition-colors text-sm"
            >
              View Full Details &rarr;
            </Link>
          </div>
        )}
      </SlidePanel>

      {/* Add Airstrip Modal */}
      <AddEditAirstripModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSaved={fetchAirstrips}
        surfaceTypes={distinctSurfaceTypes}
      />

      {/* Bulk Upload Modal */}
      <BulkUploadAirstripsModal
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onImported={fetchAirstrips}
      />
    </div>
  );
}
