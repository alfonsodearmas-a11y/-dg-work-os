'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  X,
  Copy,
  Check,
  Clock,
  Users,
  AlertTriangle,
  Timer,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { PendingApplication, PendingApplicationStats } from '@/lib/pending-applications-types';

type AgencyFilter = 'all' | 'GPL' | 'GWI';
type WaitBracket = 'all' | '0-6' | '7-14' | '15-30' | '31+';

const BRACKET_COLORS = {
  '< 7 days': '#059669',
  '7–14 days': '#d4af37',
  '15–30 days': '#f97316',
  '> 30 days': '#dc2626',
};

function getBadgeColor(days: number) {
  if (days > 30) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (days >= 15) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  if (days >= 7) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface OverviewTabProps {
  refreshKey?: number;
}

export function OverviewTab({ refreshKey }: OverviewTabProps) {
  const [stats, setStats] = useState<{ gpl: PendingApplicationStats; gwi: PendingApplicationStats } | null>(null);
  const [records, setRecords] = useState<PendingApplication[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);

  const [agencyFilter, setAgencyFilter] = useState<AgencyFilter>('all');
  const [regionFilter, setRegionFilter] = useState('');
  const [waitBracket, setWaitBracket] = useState<WaitBracket>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('days_waiting');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [selectedRecord, setSelectedRecord] = useState<PendingApplication | null>(null);
  const [copied, setCopied] = useState(false);

  // Debounce search input
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchQuery(value), 300);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadStats(retries = 2) {
      for (let i = 0; i <= retries; i++) {
        try {
          const res = await fetch('/api/pending-applications/stats');
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (!cancelled) { setStats(data); setLoading(false); }
          return;
        } catch (err) {
          console.warn('[overview] Stats fetch attempt', i + 1, 'failed:', err);
          if (i === retries && !cancelled) setLoading(false);
        }
      }
    }
    loadStats();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const fetchRecords = useCallback(async () => {
    setLoadingRecords(true);
    const params = new URLSearchParams();
    params.set('agency', agencyFilter);
    params.set('page', String(page));
    params.set('pageSize', '50');
    params.set('sortBy', sortBy);
    params.set('order', sortOrder);
    if (regionFilter) params.set('region', regionFilter);
    if (searchQuery) params.set('search', searchQuery);
    if (waitBracket === '0-6') { params.set('maxDays', '6'); }
    else if (waitBracket === '7-14') { params.set('minDays', '7'); params.set('maxDays', '14'); }
    else if (waitBracket === '15-30') { params.set('minDays', '15'); params.set('maxDays', '30'); }
    else if (waitBracket === '31+') { params.set('minDays', '31'); }

    try {
      const res = await fetch(`/api/pending-applications?${params}`);
      const data = await res.json();
      setRecords(data.records || []);
      setTotalRecords(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch { /* silent */ }
    setLoadingRecords(false);
  }, [agencyFilter, regionFilter, waitBracket, searchQuery, sortBy, sortOrder, page]);

  useEffect(() => { fetchRecords(); }, [fetchRecords, refreshKey]);
  useEffect(() => { setPage(1); }, [agencyFilter, regionFilter, waitBracket, searchQuery, sortBy, sortOrder]);

  const handleSort = (col: string) => {
    if (sortBy === col) setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder(col === 'days_waiting' ? 'desc' : 'asc'); }
  };

  const copyContact = (record: PendingApplication) => {
    const text = `${record.firstName} ${record.lastName}${record.telephone ? ' — ' + record.telephone : ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const gplStats = stats?.gpl;
  const gwiStats = stats?.gwi;
  const combinedTotal = (gplStats?.total || 0) + (gwiStats?.total || 0);
  const over30 = (gplStats?.waitBrackets.find(b => b.min === 31)?.count || 0) +
                 (gwiStats?.waitBrackets.find(b => b.min === 31)?.count || 0);

  const chartData = gplStats && gwiStats ? [
    { name: '< 7 days', GPL: gplStats.waitBrackets[0]?.count || 0, GWI: gwiStats.waitBrackets[0]?.count || 0 },
    { name: '7–14 days', GPL: gplStats.waitBrackets[1]?.count || 0, GWI: gwiStats.waitBrackets[1]?.count || 0 },
    { name: '15–30 days', GPL: gplStats.waitBrackets[2]?.count || 0, GWI: gwiStats.waitBrackets[2]?.count || 0 },
    { name: '> 30 days', GPL: gplStats.waitBrackets[3]?.count || 0, GWI: gwiStats.waitBrackets[3]?.count || 0 },
  ] : [];

  const regionData = (() => {
    if (!stats) return [];
    const src = agencyFilter === 'GPL' ? [gplStats] : agencyFilter === 'GWI' ? [gwiStats] : [gplStats, gwiStats];
    const map = new Map<string, { count: number; totalDays: number; maxDays: number; over30: number }>();
    for (const s of src) {
      if (!s) continue;
      for (const r of s.byRegion) {
        const existing = map.get(r.region) || { count: 0, totalDays: 0, maxDays: 0, over30: 0 };
        existing.count += r.count;
        existing.totalDays += r.avgDays * r.count;
        existing.maxDays = Math.max(existing.maxDays, r.maxDays);
        existing.over30 += r.over30Count;
        map.set(r.region, existing);
      }
    }
    return Array.from(map.entries())
      .map(([region, d]) => ({
        region, count: d.count,
        avgDays: Math.round(d.totalDays / d.count),
        maxDays: d.maxDays,
        pctOver30: d.count > 0 ? Math.round((d.over30 / d.count) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  })();

  const allRegions = regionData.map(r => r.region);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card-premium p-4 space-y-3">
              <div className="skeleton skeleton-text w-24" />
              <div className="skeleton skeleton-number" />
              <div className="skeleton skeleton-text w-32" />
            </div>
          ))}
        </div>
        <div className="skeleton skeleton-chart card-premium" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Data freshness */}
      {stats && (
        <div className="flex flex-wrap items-center gap-2 text-sm sm:text-xs text-[#64748b]">
          <Clock className="h-3.5 w-3.5" />
          <span>GPL data as of <span className="text-[#94a3b8]">{formatDate(gplStats?.dataAsOf || '')}</span></span>
          <span className="text-[#2d3a52]">·</span>
          <span>GWI data as of <span className="text-[#94a3b8]">{formatDate(gwiStats?.dataAsOf || '')}</span></span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="card-premium p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-[#d4af37]" />
            <span className="text-sm sm:text-xs text-[#64748b] uppercase tracking-wider font-semibold">Total Pending</span>
          </div>
          <div className="stat-number text-2xl md:text-3xl">{combinedTotal}</div>
          <div className="flex items-center gap-3 mt-2 text-sm sm:text-xs text-[#64748b]">
            <span>GPL: <span className="text-amber-400 font-medium">{gplStats?.total || 0}</span></span>
            <span>GWI: <span className="text-cyan-400 font-medium">{gwiStats?.total || 0}</span></span>
          </div>
        </div>

        <div className="card-premium p-4">
          <div className="flex items-center gap-2 mb-3">
            <Timer className="h-4 w-4 text-[#d4af37]" />
            <span className="text-sm sm:text-xs text-[#64748b] uppercase tracking-wider font-semibold">Avg Wait</span>
          </div>
          <div className="stat-number text-2xl md:text-3xl">
            {combinedTotal > 0 ? Math.round(
              ((gplStats?.avgDaysWaiting || 0) * (gplStats?.total || 0) +
               (gwiStats?.avgDaysWaiting || 0) * (gwiStats?.total || 0)) / combinedTotal
            ) : 0} <span className="text-sm sm:text-base font-normal text-[#64748b]">days</span>
          </div>
          <div className="flex items-center gap-3 mt-2 text-sm sm:text-xs text-[#64748b]">
            <span>GPL: <span className="text-amber-400 font-medium">{gplStats?.avgDaysWaiting || 0}d</span></span>
            <span>GWI: <span className="text-cyan-400 font-medium">{gwiStats?.avgDaysWaiting || 0}d</span></span>
          </div>
        </div>

        <div className="card-premium p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-[#d4af37]" />
            <span className="text-sm sm:text-xs text-[#64748b] uppercase tracking-wider font-semibold">Longest Wait</span>
          </div>
          <div className="stat-number text-2xl md:text-3xl">
            {Math.max(gplStats?.maxDaysWaiting || 0, gwiStats?.maxDaysWaiting || 0)} <span className="text-sm sm:text-base font-normal text-[#64748b]">days</span>
          </div>
          <div className="mt-2 space-y-1">
            {gplStats?.longestWaitCustomer && (
              <button onClick={() => setSelectedRecord(gplStats.longestWaitCustomer)} className="block text-sm sm:text-xs text-amber-400 hover:text-amber-300 truncate max-w-full text-left min-h-[44px] sm:min-h-0 flex items-center">
                GPL: {gplStats.longestWaitCustomer.firstName} {gplStats.longestWaitCustomer.lastName} ({gplStats.maxDaysWaiting}d)
              </button>
            )}
            {gwiStats?.longestWaitCustomer && (
              <button onClick={() => setSelectedRecord(gwiStats.longestWaitCustomer)} className="block text-sm sm:text-xs text-cyan-400 hover:text-cyan-300 truncate max-w-full text-left min-h-[44px] sm:min-h-0 flex items-center">
                GWI: {gwiStats.longestWaitCustomer.firstName} {gwiStats.longestWaitCustomer.lastName} ({gwiStats.maxDaysWaiting}d)
              </button>
            )}
          </div>
        </div>

        <div className={`card-premium p-4 ${over30 > 0 ? 'border-red-500/30' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className={`h-4 w-4 ${over30 > 0 ? 'text-red-400' : 'text-[#d4af37]'}`} />
            <span className="text-sm sm:text-xs text-[#64748b] uppercase tracking-wider font-semibold">&gt; 30 Days</span>
          </div>
          <div className={`stat-number text-2xl md:text-3xl ${over30 > 0 ? 'text-red-400' : ''}`}>{over30}</div>
          <div className="flex items-center gap-3 mt-2 text-sm sm:text-xs text-[#64748b]">
            <span>GPL: <span className={`font-medium ${(gplStats?.waitBrackets.find(b => b.min === 31)?.count || 0) > 0 ? 'text-red-400' : 'text-amber-400'}`}>
              {gplStats?.waitBrackets.find(b => b.min === 31)?.count || 0}
            </span></span>
            <span>GWI: <span className={`font-medium ${(gwiStats?.waitBrackets.find(b => b.min === 31)?.count || 0) > 0 ? 'text-red-400' : 'text-cyan-400'}`}>
              {gwiStats?.waitBrackets.find(b => b.min === 31)?.count || 0}
            </span></span>
          </div>
        </div>
      </div>

      {/* Agency Toggle */}
      <div className="flex items-center gap-2">
        {(['all', 'GPL', 'GWI'] as AgencyFilter[]).map(tab => (
          <button
            key={tab}
            onClick={() => setAgencyFilter(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              agencyFilter === tab
                ? 'bg-[#d4af37] text-[#0a1628]'
                : 'bg-[#1a2744] text-[#94a3b8] border border-[#2d3a52] hover:border-[#d4af37] hover:text-white'
            }`}
          >
            {tab === 'all' ? 'All' : tab}
          </button>
        ))}
      </div>

      {/* Wait Time Distribution Chart */}
      {chartData.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Wait Time Distribution</h3>
          <div className="h-48 md:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff' }} itemStyle={{ color: '#94a3b8' }} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                {(agencyFilter === 'all' || agencyFilter === 'GPL') && (
                  <Bar dataKey="GPL" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={16}>
                    {chartData.map((_entry, i) => (
                      <Cell key={i} fill={Object.values(BRACKET_COLORS)[i]} fillOpacity={0.9} />
                    ))}
                  </Bar>
                )}
                {(agencyFilter === 'all' || agencyFilter === 'GWI') && (
                  <Bar dataKey="GWI" fill="#06b6d4" radius={[0, 4, 4, 0]} barSize={16}>
                    {chartData.map((_entry, i) => (
                      <Cell key={i} fill={Object.values(BRACKET_COLORS)[i]} fillOpacity={0.6} />
                    ))}
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Region Breakdown */}
      {regionData.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Region Breakdown</h3>
          <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#64748b] text-sm sm:text-xs uppercase tracking-wider border-b border-[#2d3a52]">
                  <th className="text-left py-3 px-3">Region</th>
                  <th className="text-right py-3 px-3">Count</th>
                  <th className="text-right py-3 px-3">Avg Wait</th>
                  <th className="text-right py-3 px-3 hidden sm:table-cell">Max Wait</th>
                  <th className="text-right py-3 px-3">% Over 30d</th>
                </tr>
              </thead>
              <tbody>
                {regionData.map(r => (
                  <tr key={r.region} className="border-b border-[#2d3a52]/50 hover:bg-[#1a2744]/50">
                    <td className="py-3 px-3 text-white font-medium">{r.region}</td>
                    <td className="py-3 px-3 text-right text-[#94a3b8]">{r.count}</td>
                    <td className="py-3 px-3 text-right text-[#94a3b8]">{r.avgDays}d</td>
                    <td className="py-3 px-3 text-right text-[#94a3b8] hidden sm:table-cell">{r.maxDays}d</td>
                    <td className="py-3 px-3 text-right">
                      <span className={`${r.pctOver30 > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{r.pctOver30}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="card-premium p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
            <input
              type="text"
              placeholder="Search name, phone, reference..."
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-10 py-3 sm:py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-base sm:text-sm placeholder:text-[#64748b] focus:border-[#d4af37] focus:outline-none"
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearchQuery(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-white p-1">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
                className="appearance-none w-full pl-3 pr-8 py-3 sm:py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-[#94a3b8] text-base sm:text-sm focus:border-[#d4af37] focus:outline-none cursor-pointer">
                <option value="">All Regions</option>
                {allRegions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b] pointer-events-none" />
            </div>
            <div className="relative flex-1 sm:flex-none">
              <select value={waitBracket} onChange={e => setWaitBracket(e.target.value as WaitBracket)}
                className="appearance-none w-full pl-3 pr-8 py-3 sm:py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-[#94a3b8] text-base sm:text-sm focus:border-[#d4af37] focus:outline-none cursor-pointer">
                <option value="all">All Wait Times</option>
                <option value="0-6">&lt; 7 days</option>
                <option value="7-14">7–14 days</option>
                <option value="15-30">15–30 days</option>
                <option value="31+">&gt; 30 days</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b] pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Customer Records Table */}
      <div className="card-premium overflow-hidden">
        <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#64748b] text-sm sm:text-xs uppercase tracking-wider border-b border-[#2d3a52] bg-[#0a1628]/50">
                <th className="text-left py-3 px-3">Agency</th>
                <SortHeader label="Name" field="last_name" current={sortBy} order={sortOrder} onSort={handleSort} />
                <th className="text-left py-3 px-3 hidden md:table-cell">Region</th>
                <th className="text-left py-3 px-3 hidden lg:table-cell">District/Village</th>
                <SortHeader label="Applied" field="application_date" current={sortBy} order={sortOrder} onSort={handleSort} />
                <SortHeader label="Days" field="days_waiting" current={sortBy} order={sortOrder} onSort={handleSort} />
                <th className="text-left py-3 px-3 hidden md:table-cell">Ref No.</th>
              </tr>
            </thead>
            <tbody>
              {loadingRecords ? (
                <tr><td colSpan={7} className="py-12 text-center"><div className="w-6 h-6 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin mx-auto" /></td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-[#64748b]">No records found</td></tr>
              ) : records.map(record => (
                <tr key={record.id} onClick={() => setSelectedRecord(record)} className="border-b border-[#2d3a52]/50 hover:bg-[#1a2744]/50 cursor-pointer transition-colors">
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded text-sm sm:text-xs font-semibold ${record.agency === 'GPL' ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'}`}>{record.agency}</span>
                  </td>
                  <td className="py-3 px-3 text-white font-medium text-sm">{record.firstName} {record.lastName}</td>
                  <td className="py-3 px-3 text-[#94a3b8] hidden md:table-cell">{record.region || '—'}</td>
                  <td className="py-3 px-3 text-[#94a3b8] hidden lg:table-cell truncate max-w-[200px]">{record.district || record.villageWard || '—'}</td>
                  <td className="py-3 px-3 text-[#94a3b8] whitespace-nowrap text-sm">{formatDate(record.applicationDate)}</td>
                  <td className="py-3 px-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-sm sm:text-xs font-semibold border ${getBadgeColor(record.daysWaiting)}`}>{record.daysWaiting}d</span>
                  </td>
                  <td className="py-3 px-3 text-[#64748b] font-mono text-xs hidden md:table-cell">{record.customerReference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#2d3a52]">
            <span className="text-sm sm:text-xs text-[#64748b]">{totalRecords} records · Page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-2.5 sm:p-1.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-2.5 sm:p-1.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-Over Detail Drawer */}
      {selectedRecord && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[46]" onClick={() => setSelectedRecord(null)} />
          <div className="fixed inset-y-0 right-0 w-full sm:w-[440px] bg-[#0a1628] border-l border-[#2d3a52] z-50 flex flex-col">
            <div className="flex-shrink-0 bg-[#1a2744]/95 backdrop-blur-sm border-b border-[#2d3a52] px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`px-2.5 py-1 rounded text-xs font-bold ${selectedRecord.agency === 'GPL' ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'}`}>{selectedRecord.agency}</span>
                  <h2 className="text-lg font-bold text-white truncate">{selectedRecord.firstName} {selectedRecord.lastName}</h2>
                </div>
                <button onClick={() => setSelectedRecord(null)} className="p-2 rounded-lg hover:bg-[#2d3a52] text-[#94a3b8] hover:text-white transition-colors"><X size={20} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div className={`rounded-xl p-4 border ${getBadgeColor(selectedRecord.daysWaiting)} text-center`}>
                <div className="text-3xl font-bold">{selectedRecord.daysWaiting}</div>
                <div className="text-xs mt-1 opacity-80">days waiting</div>
              </div>
              <div className="space-y-3">
                <DetailRow label="Customer Reference" value={selectedRecord.customerReference} />
                <DetailRow label="Application Date" value={formatDate(selectedRecord.applicationDate)} />
                <DetailRow label="Region" value={selectedRecord.region} />
                <DetailRow label="District" value={selectedRecord.district} />
                <DetailRow label="Village/Ward" value={selectedRecord.villageWard} />
                <DetailRow label="Street" value={selectedRecord.street} />
                <DetailRow label="Lot" value={selectedRecord.lot} />
                <DetailRow label="Telephone" value={selectedRecord.telephone} />
                <DetailRow label="Event Code" value={selectedRecord.eventCode} />
                <DetailRow label="Event Description" value={selectedRecord.eventDescription} />
                {selectedRecord.pipelineStage && <DetailRow label="Pipeline Stage" value={selectedRecord.pipelineStage} />}
                {selectedRecord.accountType && <DetailRow label="Account Type" value={selectedRecord.accountType} />}
                {selectedRecord.serviceOrderType && <DetailRow label="Service Order Type" value={selectedRecord.serviceOrderType} />}
                <DetailRow label="Data As Of" value={formatDate(selectedRecord.dataAsOf)} />
              </div>
              <button onClick={() => copyContact(selectedRecord)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] hover:text-white transition-colors">
                {copied ? (<><Check className="h-4 w-4 text-emerald-400" /><span className="text-emerald-400">Copied</span></>) : (<><Copy className="h-4 w-4" /><span>Copy Contact</span></>)}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SortHeader({ label, field, current, order, onSort }: { label: string; field: string; current: string; order: 'asc' | 'desc'; onSort: (f: string) => void }) {
  return (
    <th className="text-left py-3 px-3 cursor-pointer hover:text-white transition-colors select-none whitespace-nowrap" onClick={() => onSort(field)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${current === field ? 'text-[#d4af37]' : ''}`} />
      </span>
    </th>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#2d3a52]/50">
      <span className="text-sm sm:text-xs text-[#64748b] w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-white break-words min-w-0">{value}</span>
    </div>
  );
}
