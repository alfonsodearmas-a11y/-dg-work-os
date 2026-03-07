'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, Loader2, Brain, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Search, X, ArrowUpDown, MapPin } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { GWIAnalysis, DeepAnalysisResult, PendingApplication } from '@/lib/pending-applications-types';

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  warning: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  stable: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  positive: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
};

function getBadgeColor(days: number) {
  if (days > 30) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (days >= 15) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  if (days >= 7) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
}

function fmtDate(s: string) {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function GWIAnalysisPanel() {
  const [analysis, setAnalysis] = useState<GWIAnalysis | null>(null);
  const [deepAnalysis, setDeepAnalysis] = useState<DeepAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);

  // Records state
  const [records, setRecords] = useState<PendingApplication[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [sortBy, setSortBy] = useState('days_waiting');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Debounce search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchQuery(value), 300);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [analysisRes, deepRes] = await Promise.all([
          fetch('/api/pending-applications/analysis?agency=GWI'),
          fetch('/api/pending-applications/analysis/deep?agency=GWI'),
        ]);
        if (analysisRes.ok) {
          const data = await analysisRes.json();
          setAnalysis(data.analysis);
        }
        if (deepRes.ok) {
          const data = await deepRes.json();
          if (data.analysis) setDeepAnalysis(data.analysis);
        }
      } catch (err) {
        setError('Failed to load analysis');
        console.error(err);
      }
      setLoading(false);
    }
    load();
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoadingRecords(true);
    const params = new URLSearchParams();
    params.set('agency', 'GWI');
    params.set('page', String(page));
    params.set('pageSize', '50');
    params.set('sortBy', sortBy);
    params.set('order', sortOrder);
    if (searchQuery) params.set('search', searchQuery);
    if (regionFilter) params.set('region', regionFilter);
    try {
      const res = await fetch(`/api/pending-applications?${params}`);
      const data = await res.json();
      setRecords(data.records || []);
      setTotalRecords(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch { /* silent */ }
    setLoadingRecords(false);
  }, [searchQuery, regionFilter, sortBy, sortOrder, page]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);
  useEffect(() => { setPage(1); }, [searchQuery, regionFilter, sortBy, sortOrder]);

  const handleSort = (col: string) => {
    if (sortBy === col) setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder(col === 'days_waiting' ? 'desc' : 'asc'); }
  };

  const generateDeepAnalysis = async () => {
    setGeneratingAI(true);
    setError(null);
    try {
      const res = await fetch('/api/pending-applications/analysis/deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency: 'GWI' }),
      });
      const data = await res.json();
      if (res.ok && data.analysis) {
        setDeepAnalysis(data.analysis);
      } else {
        setError(data.error || 'AI analysis failed');
      }
    } catch {
      setError('Network error');
    }
    setGeneratingAI(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!analysis) {
    return <div className="card-premium p-8 text-center"><p className="text-[#64748b]">No GWI records found. Upload a GWI pending applications file first.</p></div>;
  }

  const agingData = analysis.agingBuckets.map(b => ({ name: b.label, count: b.count, pct: b.pct }));
  const AGING_COLORS = ['#059669', '#10b981', '#d4af37', '#f97316', '#dc2626'];
  const regionNames = analysis.regions.map(r => r.region);

  return (
    <div className="space-y-6">
      {/* Regional Distribution */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Regional Distribution</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={analysis.regions.slice(0, 10).map(r => ({ name: r.region, count: r.count, avgDays: r.avgDays }))}
              layout="vertical"
              margin={{ left: 10, right: 20 }}
            >
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
              <Tooltip
                contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff' }}
                formatter={(value: number, name: string) => [value, name === 'count' ? 'Applications' : 'Avg Wait']}
              />
              <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Expandable region detail */}
        <div className="mt-4 space-y-1">
          {analysis.regions.map(region => (
            <div key={region.region}>
              <button
                onClick={() => setExpandedRegion(expandedRegion === region.region ? null : region.region)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#1a2744]/50 text-sm transition-colors"
              >
                <div className="flex items-center gap-2">
                  {expandedRegion === region.region ? <ChevronDown className="h-3.5 w-3.5 text-cyan-400" /> : <ChevronRight className="h-3.5 w-3.5 text-[#64748b]" />}
                  <span className="text-white font-medium">{region.region}</span>
                  <span className="text-[#64748b]">{region.count} apps</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#64748b]">
                  <span>avg {region.avgDays}d</span>
                  <span>max {region.maxDays}d</span>
                </div>
              </button>
              {expandedRegion === region.region && region.districts.length > 0 && (
                <div className="ml-8 mb-2 space-y-1">
                  {region.districts.map(d => (
                    <div key={d.district} className="flex items-center justify-between px-3 py-1.5 text-xs text-[#94a3b8]">
                      <span>{d.district}</span>
                      <span>{d.count} apps · avg {d.avgDays}d</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Aging Buckets */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Aging Distribution</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={agingData} margin={{ left: 0, right: 10 }}>
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff' }}
                formatter={(value: number, _name: string, props: { payload?: { pct: number } }) => [`${value} (${props.payload?.pct ?? 0}%)`, 'Count']}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={32}>
                {agingData.map((_entry, i) => (
                  <Cell key={i} fill={AGING_COLORS[i] || '#64748b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Community Clusters */}
      {analysis.communityClusters.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">Community Clusters (5+ pending)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#64748b] text-xs uppercase tracking-wider border-b border-[#2d3a52]">
                  <th className="text-left py-2 pr-4">Village/Community</th>
                  <th className="text-left py-2 px-3">Region</th>
                  <th className="text-right py-2 px-3">Pending</th>
                  <th className="text-right py-2 pl-3">Avg Wait</th>
                </tr>
              </thead>
              <tbody>
                {analysis.communityClusters.map(c => (
                  <tr key={c.village} className="border-b border-[#2d3a52]/50">
                    <td className="py-2.5 pr-4 text-white font-medium">{c.village}</td>
                    <td className="py-2.5 px-3 text-[#94a3b8]">{c.region}</td>
                    <td className="py-2.5 px-3 text-right text-cyan-400 font-medium">{c.count}</td>
                    <td className="py-2.5 pl-3 text-right text-[#94a3b8]">{c.avgDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Red Flags */}
      {analysis.redFlags.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-red-400 mb-3">Red Flags</h3>
          <div className="space-y-2">
            {analysis.redFlags.map((flag, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <span className="text-[#94a3b8]">{flag}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Individual Applications */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">All GWI Applications ({totalRecords})</h3>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
            <input
              type="text"
              placeholder="Search name, reference, village..."
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
          <div className="relative">
            <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
              className="appearance-none w-full pl-3 pr-8 py-3 sm:py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-[#94a3b8] text-base sm:text-sm focus:border-[#d4af37] focus:outline-none cursor-pointer">
              <option value="">All Regions</option>
              {regionNames.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b] pointer-events-none" />
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#64748b] text-xs uppercase tracking-wider border-b border-[#2d3a52] bg-[#0a1628]/50">
                <SortHeader label="Name" field="last_name" current={sortBy} order={sortOrder} onSort={handleSort} />
                <th className="text-left py-3 px-3">Customer Ref</th>
                <SortHeader label="Region" field="region" current={sortBy} order={sortOrder} onSort={handleSort} />
                <th className="text-left py-3 px-3">District</th>
                <th className="text-left py-3 px-3">Village/Ward</th>
                <SortHeader label="Days" field="days_waiting" current={sortBy} order={sortOrder} onSort={handleSort} />
                <SortHeader label="Applied" field="application_date" current={sortBy} order={sortOrder} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {loadingRecords ? (
                <tr><td colSpan={7} className="py-12 text-center"><div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" /></td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-[#64748b]">No records found</td></tr>
              ) : records.map(r => (
                <RecordRow key={r.id} record={r} expanded={expandedId === r.id} onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-2">
          {loadingRecords ? (
            <div className="py-12 text-center"><div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" /></div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center text-[#64748b]">No records found</div>
          ) : records.map(r => (
            <MobileCard key={r.id} record={r} expanded={expandedId === r.id} onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)} />
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#2d3a52]">
            <span className="text-sm sm:text-xs text-[#64748b]">{totalRecords} records · Page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-2.5 sm:p-1.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] disabled:opacity-30">
                <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-2.5 sm:p-1.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] disabled:opacity-30">
                <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI Deep Analysis */}
      <div className="card-premium p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-[#d4af37]" />
            <h3 className="text-sm font-semibold text-white">AI Deep Analysis</h3>
          </div>
          <button
            onClick={generateDeepAnalysis}
            disabled={generatingAI}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] hover:text-white disabled:opacity-50 transition-colors"
          >
            {generatingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {deepAnalysis ? 'Regenerate' : 'Generate'}
          </button>
        </div>

        {generatingAI && (
          <div className="flex items-center justify-center gap-3 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[#d4af37]" />
            <span className="text-sm text-[#64748b]">Generating AI analysis (this may take a minute)...</span>
          </div>
        )}

        {!generatingAI && deepAnalysis && (
          <div className="space-y-4">
            <p className="text-sm text-[#94a3b8] leading-relaxed">{deepAnalysis.executiveSummary}</p>

            {deepAnalysis.sections?.map((section, i) => {
              const sev = SEVERITY_CONFIG[section.severity] || SEVERITY_CONFIG.stable;
              return <BriefingSection key={i} section={section} sev={sev} />;
            })}

            {deepAnalysis.recommendations && deepAnalysis.recommendations.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs text-[#64748b] uppercase tracking-wider font-semibold mb-2">Recommendations</h4>
                <div className="space-y-2">
                  {deepAnalysis.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[#0a1628] border border-[#2d3a52]">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${
                        rec.urgency === 'Immediate' ? 'bg-red-500/20 text-red-400' :
                        rec.urgency === 'Short-term' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>{rec.urgency}</span>
                      <div>
                        <p className="text-sm text-white">{rec.recommendation}</p>
                        <p className="text-xs text-[#64748b] mt-0.5">{rec.category}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-[#64748b]">
              Generated {deepAnalysis.createdAt ? new Date(deepAnalysis.createdAt).toLocaleString() : 'just now'}
            </p>
          </div>
        )}

        {!generatingAI && !deepAnalysis && (
          <p className="text-sm text-[#64748b] py-4">Click Generate to create an AI-powered deep analysis of GWI pending applications.</p>
        )}

        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

function RecordRow({ record: r, expanded, onToggle }: { record: PendingApplication; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr onClick={onToggle} className="border-b border-[#2d3a52]/50 hover:bg-[#1a2744]/50 cursor-pointer transition-colors">
        <td className="py-3 px-3 text-white font-medium">{r.firstName} {r.lastName}</td>
        <td className="py-3 px-3 text-[#94a3b8] font-mono text-xs">{r.customerReference || '—'}</td>
        <td className="py-3 px-3 text-[#94a3b8]">{r.region || '—'}</td>
        <td className="py-3 px-3 text-[#94a3b8]">{r.district || '—'}</td>
        <td className="py-3 px-3 text-[#94a3b8] truncate max-w-[150px]">{r.villageWard || '—'}</td>
        <td className="py-3 px-3">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${getBadgeColor(r.daysWaiting)}`}>{r.daysWaiting}d</span>
        </td>
        <td className="py-3 px-3 text-[#94a3b8] whitespace-nowrap">{fmtDate(r.applicationDate)}</td>
      </tr>
      {expanded && (
        <tr className="bg-[#0a1628]/80">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <DetailItem label="Customer Ref" value={r.customerReference} />
              <DetailItem label="Region" value={r.region} />
              <DetailItem label="District" value={r.district} />
              <DetailItem label="Village/Ward" value={r.villageWard} />
              <DetailItem label="Street" value={r.street} />
              <DetailItem label="Lot" value={r.lot} />
              <DetailItem label="Telephone" value={r.telephone} />
              <DetailItem label="Event Code" value={r.eventCode} />
              <DetailItem label="Event Description" value={r.eventDescription} />
              <DetailItem label="Applied" value={fmtDate(r.applicationDate)} />
              <DetailItem label="Days Waiting" value={`${r.daysWaiting}`} />
              <DetailItem label="Data As Of" value={fmtDate(r.dataAsOf)} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MobileCard({ record: r, expanded, onToggle }: { record: PendingApplication; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl bg-[#0a1628] border border-[#2d3a52] overflow-hidden" onClick={onToggle}>
      <div className="p-3 flex items-center justify-between cursor-pointer min-h-[56px]">
        <div className="min-w-0">
          <div className="text-sm text-white font-medium truncate">{r.firstName} {r.lastName}</div>
          <div className="flex items-center gap-2 mt-1 text-sm sm:text-xs text-[#64748b]">
            <span>{r.region || '—'}</span>
            {r.district && <span>· {r.district}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex px-2 py-1 rounded-full text-sm sm:text-xs font-semibold border ${getBadgeColor(r.daysWaiting)}`}>{r.daysWaiting}d</span>
          <ChevronDown className={`h-5 w-5 text-[#64748b] transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-[#2d3a52]/50 pt-2 space-y-2">
          <DetailItem label="Customer Ref" value={r.customerReference} />
          <DetailItem label="Village/Ward" value={r.villageWard} />
          <DetailItem label="Street" value={r.street} />
          <DetailItem label="Lot" value={r.lot} />
          <DetailItem label="Telephone" value={r.telephone} />
          <DetailItem label="Event" value={r.eventDescription} />
          <DetailItem label="Applied" value={fmtDate(r.applicationDate)} />
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="text-sm sm:text-xs">
      <span className="text-[#64748b]">{label}: </span>
      <span className="text-[#94a3b8]">{value}</span>
    </div>
  );
}

function BriefingSection({ section, sev }: { section: { title: string; severity: string; summary: string; detail: string }; sev: { bg: string; text: string; border: string } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`rounded-xl border ${sev.border} overflow-hidden`}>
      <button type="button" onClick={() => setExpanded(!expanded)} className="w-full text-left px-4 py-3 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-white">{section.title}</span>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${sev.bg} ${sev.text}`}>{section.severity}</span>
            <ChevronDown className={`w-4 h-4 text-[#64748b] transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
        <p className="text-sm text-[#94a3b8]">{section.summary}</p>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
            <p className="text-sm text-[#94a3b8] leading-relaxed">{section.detail}</p>
          </div>
        </div>
      )}
    </div>
  );
}
