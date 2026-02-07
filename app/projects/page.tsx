'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Upload,
  AlertTriangle,
  Building2,
  DollarSign,
  Clock,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  Search,
  Filter,
  Camera,
  X,
  CircleDot,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

// ── Types ──────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  project_id: string;
  executing_agency: string | null;
  sub_agency: string | null;
  project_name: string | null;
  region: string | null;
  contract_value: number | null;
  contractor: string | null;
  project_end_date: string | null;
  completion_pct: number;
  has_images: number;
  status: string;
  days_overdue: number;
}

interface AgencySummary {
  agency: string;
  total: number;
  complete: number;
  in_progress: number;
  delayed: number;
  not_started: number;
  total_value: number;
  avg_completion: number;
}

interface PortfolioSummary {
  total_projects: number;
  total_value: number;
  complete: number;
  in_progress: number;
  delayed: number;
  not_started: number;
  delayed_value: number;
  agencies: AgencySummary[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const AGENCY_NAMES: Record<string, string> = {
  GPL: 'Guyana Power & Light',
  GWI: 'Guyana Water Inc.',
  HECI: 'Hinterland Electrification',
  CJIA: 'CJIA Airport',
  MARAD: 'Maritime Administration',
  GCAA: 'Civil Aviation Authority',
  MOPUA: 'Ministry of Public Works',
  HAS: 'Harbour & Aviation',
};

const STATUS_STYLES: Record<string, { variant: 'success' | 'danger' | 'info' | 'default'; label: string }> = {
  Complete: { variant: 'success', label: 'Complete' },
  Delayed: { variant: 'danger', label: 'Delayed' },
  'In Progress': { variant: 'info', label: 'In Progress' },
  'Not Started': { variant: 'default', label: 'Not Started' },
};

// ── Formatting ─────────────────────────────────────────────────────────────

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

// ── Upload Modal ───────────────────────────────────────────────────────────

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ project_count: number; agency_counts: Record<string, number>; total_value: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleFile(f: File) {
    setFile(f);
    setError('');
    setPreview(null);
    setSuccess('');

    // Preview: parse client-side via API with ?preview=1
    setUploading(true);
    const fd = new FormData();
    fd.append('file', f);

    try {
      const res = await fetch('/api/projects/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setSuccess(`Uploaded ${data.project_count} projects across ${Object.keys(data.agency_counts).length} agencies`);
      setPreview({ project_count: data.project_count, agency_counts: data.agency_counts, total_value: data.total_value });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card-premium p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Upload Project Listings</h2>
          <button onClick={onClose} className="text-[#64748b] hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <label className="upload-zone p-8 text-center cursor-pointer block">
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            disabled={uploading}
          />
          {uploading ? (
            <div className="flex flex-col items-center">
              <Loader2 className="h-10 w-10 text-[#d4af37] animate-spin mb-3" />
              <p className="text-white font-medium">Processing...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-[#d4af37]/20 flex items-center justify-center mb-3">
                <Upload className="h-7 w-7 text-[#d4af37]" />
              </div>
              <p className="text-white font-medium">Drop Excel file or click to browse</p>
              <p className="text-[#64748b] text-sm mt-1">oversight.gov.gy export (.xlsx)</p>
            </div>
          )}
        </label>

        {error && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {success && preview && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
              <p className="text-emerald-400 text-sm">{success}</p>
            </div>
            <div className="p-3 rounded-xl bg-[#0a1628] border border-[#2d3a52] text-sm">
              <div className="flex justify-between text-[#94a3b8]">
                <span>Total Value</span>
                <span className="text-[#d4af37] font-semibold">{fmtCurrency(preview.total_value)}</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(preview.agency_counts).sort((a, b) => b[1] - a[1]).map(([ag, ct]) => (
                  <span key={ag} className="px-2 py-0.5 rounded bg-[#1a2744] text-xs text-[#94a3b8]">
                    {ag}: {ct}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Progress Bar ───────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? 'bg-emerald-500' : pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : pct > 0 ? 'bg-red-500' : 'bg-[#2d3a52]';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-[#2d3a52] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-[#94a3b8] w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── Expanded Row Detail ────────────────────────────────────────────────────

function ProjectDetail({ project }: { project: Project }) {
  return (
    <tr>
      <td colSpan={9} className="px-4 py-4 bg-[#0a1628]/50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-[#64748b]">Project ID</span>
            <p className="text-[#94a3b8] font-mono text-xs mt-0.5">{project.project_id}</p>
          </div>
          <div>
            <span className="text-[#64748b]">Executing Agency</span>
            <p className="text-white mt-0.5">{project.executing_agency || '-'}</p>
          </div>
          <div>
            <span className="text-[#64748b]">Contract Value</span>
            <p className="text-[#d4af37] font-semibold mt-0.5">{fmtCurrency(project.contract_value)}</p>
          </div>
          <div>
            <span className="text-[#64748b]">Contractor</span>
            <p className="text-white mt-0.5">{project.contractor || '-'}</p>
          </div>
          <div>
            <span className="text-[#64748b]">Region</span>
            <p className="text-white mt-0.5">{fmtRegion(project.region)}</p>
          </div>
          <div>
            <span className="text-[#64748b]">End Date</span>
            <p className={`mt-0.5 ${project.status === 'Delayed' ? 'text-red-400 font-semibold' : 'text-white'}`}>
              {fmtDate(project.project_end_date)}
            </p>
          </div>
          <div>
            <span className="text-[#64748b]">Completion</span>
            <div className="mt-0.5"><ProgressBar pct={project.completion_pct} /></div>
          </div>
          {project.days_overdue > 0 && (
            <div>
              <span className="text-[#64748b]">Days Overdue</span>
              <p className="text-red-400 font-semibold mt-0.5">{project.days_overdue} days</p>
            </div>
          )}
        </div>
        <div className="mt-3">
          <span className="text-[#64748b] text-sm">Full Name</span>
          <p className="text-white text-sm mt-0.5">{project.project_name}</p>
        </div>
      </td>
    </tr>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  // Data
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // UI
  const [showUpload, setShowUpload] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [expandedAgency, setExpandedAgency] = useState<string | null>(null);

  // Filters
  const [agency, setAgency] = useState('');
  const [status, setStatus] = useState('');
  const [region, setRegion] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('value');
  const [page, setPage] = useState(1);
  const limit = 25;
  const tableRef = useRef<HTMLDivElement>(null);

  function scrollToTable() {
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/projects/summary');
      const data = await res.json();
      if (data.total_projects !== undefined) setSummary(data);
    } catch { /* ignore */ }
  }, []);

  // Fetch project list
  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const params = new URLSearchParams();
      if (agency) params.set('agency', agency);
      if (status) params.set('status', status);
      if (region) params.set('region', region);
      if (search) params.set('search', search);
      if (sort) params.set('sort', sort);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const res = await fetch(`/api/projects/list?${params}`);
      const data = await res.json();
      setProjects(data.projects || []);
      setTotalCount(data.total || 0);
    } catch { /* ignore */ }
    setLoadingProjects(false);
  }, [agency, status, region, search, sort, page]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchSummary(), fetchProjects()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [agency, status, region, search, sort]);

  function handleRefresh() {
    setLoading(true);
    Promise.all([fetchSummary(), fetchProjects()]).finally(() => setLoading(false));
  }

  function showDelayed() {
    setStatus(s => {
      if (s === 'Delayed') return '';
      return 'Delayed';
    });
    setSort('end_date');
    scrollToTable();
  }

  function applyKpiFilter(newStatus: string, newSort?: string) {
    setStatus(s => s === newStatus ? '' : newStatus);
    if (newSort) setSort(newSort);
    scrollToTable();
  }

  function clearFilters() {
    setAgency('');
    setStatus('');
    setRegion('');
    setSearch('');
    setSort('value');
    setExpandedAgency(null);
  }

  // Active filter description for the chip
  const activeFilterLabel = useMemo(() => {
    const parts: string[] = [];
    if (agency) parts.push(agency);
    if (status) parts.push(status);
    if (region) parts.push(fmtRegion(region));
    if (search) parts.push(`"${search}"`);
    return parts.length > 0 ? parts.join(' + ') : null;
  }, [agency, status, region, search]);

  // Available regions from summary
  const regions = useMemo(() => {
    if (!summary) return [];
    return ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];
  }, [summary]);

  const totalPages = Math.ceil(totalCount / limit);

  // Loading skeleton
  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Project Tracker</h1>
            <p className="text-[#64748b] mt-1">Capital projects from oversight.gov.gy</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-premium p-5 animate-pulse">
              <div className="h-8 bg-[#2d3a52] rounded w-16 mb-2" />
              <div className="h-4 bg-[#2d3a52] rounded w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onDone={() => { setShowUpload(false); handleRefresh(); }}
        />
      )}

      {/* ── Delayed Alert Banner ── */}
      {summary && summary.delayed > 0 && !status && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-red-500/10 border border-red-500/30">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <div>
              <p className="text-red-400 font-semibold">
                {summary.delayed} projects are past their deadline
                {summary.delayed_value > 0 && <span className="font-normal text-red-400/80"> — worth {fmtCurrency(summary.delayed_value)}</span>}
              </p>
            </div>
          </div>
          <button onClick={showDelayed} className="btn-navy text-sm px-3 py-1.5 shrink-0">
            View Delayed
          </button>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Project Tracker</h1>
          <p className="text-[#64748b] mt-1">Capital projects from oversight.gov.gy</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleRefresh} className="btn-navy flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
          <button onClick={() => setShowUpload(true)} className="btn-gold flex items-center gap-2">
            <Upload className="h-4 w-4" />
            <span>Upload Excel</span>
          </button>
        </div>
      </div>

      {/* ── Portfolio Summary KPI Cards ── */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard
            icon={Building2}
            label="Total Projects"
            value={String(summary.total_projects)}
            color="gold"
            onClick={() => { clearFilters(); scrollToTable(); }}
            active={!status && !agency && !region && !search}
          />
          <KpiCard
            icon={DollarSign}
            label="Portfolio Value"
            value={fmtCurrency(summary.total_value)}
            color="gold"
            onClick={() => { clearFilters(); setSort('value'); scrollToTable(); }}
            active={false}
          />
          <KpiCard
            icon={Clock}
            label="In Progress"
            value={String(summary.in_progress)}
            color="blue"
            onClick={() => applyKpiFilter('In Progress')}
            active={status === 'In Progress'}
          />
          <KpiCard
            icon={AlertTriangle}
            label="Delayed"
            value={String(summary.delayed)}
            color="red"
            onClick={showDelayed}
            active={status === 'Delayed'}
          />
          <KpiCard
            icon={CheckCircle}
            label="Complete"
            value={String(summary.complete)}
            color="green"
            onClick={() => applyKpiFilter('Complete')}
            active={status === 'Complete'}
          />
          <KpiCard
            icon={CircleDot}
            label="Not Started"
            value={String(summary.not_started)}
            color="grey"
            onClick={() => applyKpiFilter('Not Started')}
            active={status === 'Not Started'}
          />
        </div>
      )}

      {/* ── Agency Breakdown ── */}
      {summary && summary.agencies.length > 0 && (
        <div className="card-premium overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2d3a52]">
            <h2 className="text-white font-semibold">Agency Breakdown</h2>
          </div>
          <div className="divide-y divide-[#2d3a52]">
            {summary.agencies.map(a => {
              const isActive = agency === a.agency;
              return (
                <div key={a.agency}>
                  <div
                    className={`w-full px-5 py-3 flex items-center justify-between hover:bg-[#1a2744]/60 transition-colors cursor-pointer ${isActive ? 'bg-[#1a2744]/40 border-l-2 border-[#d4af37]' : ''}`}
                  >
                    <button
                      onClick={() => { setAgency(isActive ? '' : a.agency); setExpandedAgency(isActive ? null : a.agency); scrollToTable(); }}
                      className="flex items-center gap-4 min-w-0 text-left"
                    >
                      <div className="shrink-0">
                        <span className="text-[#d4af37] font-bold text-sm">{a.agency}</span>
                        <p className="text-[#64748b] text-xs">{AGENCY_NAMES[a.agency] || a.agency}</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-6 text-sm">
                      <button
                        onClick={() => { setAgency(isActive ? '' : a.agency); setExpandedAgency(isActive ? null : a.agency); scrollToTable(); }}
                        className="text-right hover:opacity-80"
                      >
                        <span className="text-white font-semibold">{a.total}</span>
                        <span className="text-[#64748b] ml-1 text-xs">projects</span>
                      </button>
                      <div className="text-right w-20">
                        <span className="text-[#d4af37] font-semibold">{fmtCurrency(a.total_value)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        {a.delayed > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setAgency(a.agency); setStatus('Delayed'); setSort('end_date'); setExpandedAgency(a.agency); scrollToTable(); }}
                            className="text-red-400 hover:text-red-300 hover:underline"
                          >
                            {a.delayed} delayed
                          </button>
                        )}
                        {a.complete > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setAgency(a.agency); setStatus('Complete'); setExpandedAgency(a.agency); scrollToTable(); }}
                            className="text-emerald-400 hover:text-emerald-300 hover:underline"
                          >
                            {a.complete} done
                          </button>
                        )}
                        {a.in_progress > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setAgency(a.agency); setStatus('In Progress'); setExpandedAgency(a.agency); scrollToTable(); }}
                            className="text-blue-400 hover:text-blue-300 hover:underline"
                          >
                            {a.in_progress} active
                          </button>
                        )}
                      </div>
                      <ChevronDown className={`h-4 w-4 text-[#64748b] transition-transform ${isActive ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Filters Bar ── */}
      <div className="card-premium p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Agency */}
          <select
            value={agency}
            onChange={e => { setAgency(e.target.value); setExpandedAgency(e.target.value || null); }}
            className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none"
          >
            <option value="">All Agencies</option>
            {Object.keys(AGENCY_NAMES).map(ag => <option key={ag} value={ag}>{ag}</option>)}
          </select>

          {/* Status */}
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="In Progress">In Progress</option>
            <option value="Delayed">Delayed</option>
            <option value="Complete">Complete</option>
            <option value="Not Started">Not Started</option>
          </select>

          {/* Region */}
          <select
            value={region}
            onChange={e => setRegion(e.target.value)}
            className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none"
          >
            <option value="">All Regions</option>
            {regions.map(r => <option key={r} value={r}>Region {parseInt(r, 10)}</option>)}
          </select>

          {/* Sort */}
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none"
          >
            <option value="value">Sort: Value</option>
            <option value="completion">Sort: Completion %</option>
            <option value="end_date">Sort: End Date</option>
            <option value="agency">Sort: Agency</option>
            <option value="name">Sort: Name</option>
          </select>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
            <input
              type="text"
              placeholder="Search projects, contractors, IDs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none"
            />
          </div>

          {/* Clear Filters */}
          {(agency || status || region || search) && (
            <button
              onClick={clearFilters}
              className="text-[#64748b] hover:text-white text-sm flex items-center gap-1"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Active Filter Chip ── */}
      {activeFilterLabel && (
        <div ref={tableRef} className="flex items-center gap-2 -mb-3 scroll-mt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#d4af37]/10 border border-[#d4af37]/30 text-sm">
            <Filter className="h-3.5 w-3.5 text-[#d4af37]" />
            <span className="text-[#d4af37]">Showing: {activeFilterLabel}</span>
            <span className="text-[#d4af37]/60">({totalCount})</span>
            <button onClick={clearFilters} className="ml-1 text-[#d4af37]/60 hover:text-[#d4af37]">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Project Table ── */}
      <div className={`card-premium overflow-hidden ${!activeFilterLabel ? 'scroll-mt-4' : ''}`} ref={!activeFilterLabel ? tableRef : undefined}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2d3a52] text-[#64748b] text-xs uppercase">
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Project Name</th>
                <th className="px-4 py-3 text-left font-medium">Agency</th>
                <th className="px-4 py-3 text-left font-medium">Region</th>
                <th className="px-4 py-3 text-left font-medium">Contractor</th>
                <th className="px-4 py-3 text-right font-medium">Value</th>
                <th className="px-4 py-3 text-left font-medium">End Date</th>
                <th className="px-4 py-3 text-left font-medium">Completion</th>
                <th className="px-4 py-3 text-center font-medium">Img</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2d3a52]/50">
              {loadingProjects ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-5 bg-[#2d3a52] rounded w-20" /></td>
                    <td className="px-4 py-3"><div className="h-5 bg-[#2d3a52] rounded w-48" /></td>
                    <td className="px-4 py-3"><div className="h-5 bg-[#2d3a52] rounded w-12" /></td>
                    <td className="px-4 py-3"><div className="h-5 bg-[#2d3a52] rounded w-16" /></td>
                    <td className="px-4 py-3"><div className="h-5 bg-[#2d3a52] rounded w-28" /></td>
                    <td className="px-4 py-3"><div className="h-5 bg-[#2d3a52] rounded w-16" /></td>
                    <td className="px-4 py-3"><div className="h-5 bg-[#2d3a52] rounded w-24" /></td>
                    <td className="px-4 py-3"><div className="h-5 bg-[#2d3a52] rounded w-20" /></td>
                    <td className="px-4 py-3"><div className="h-5 bg-[#2d3a52] rounded w-8" /></td>
                  </tr>
                ))
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-[#64748b]">
                    {summary && summary.total_projects > 0 ? 'No projects match your filters.' : 'No projects yet. Upload an Excel file to get started.'}
                  </td>
                </tr>
              ) : (
                projects.map(p => {
                  const ss = STATUS_STYLES[p.status] || STATUS_STYLES['Not Started'];
                  const isExpanded = expandedRow === p.id;
                  const isPastDue = p.status === 'Delayed';

                  return (
                    <React.Fragment key={p.id}>
                      <tr
                        onClick={() => setExpandedRow(isExpanded ? null : p.id)}
                        className="hover:bg-[#1a2744]/40 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Badge variant={ss.variant}>{ss.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-white truncate block max-w-[280px]" title={p.project_name || ''}>
                            {(p.project_name || '').length > 60
                              ? (p.project_name || '').slice(0, 60) + '...'
                              : p.project_name || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[#d4af37] font-medium text-xs">{p.sub_agency || '-'}</span>
                        </td>
                        <td className="px-4 py-3 text-[#94a3b8]">{fmtRegion(p.region)}</td>
                        <td className="px-4 py-3">
                          <span className="text-[#94a3b8] truncate block max-w-[160px]" title={p.contractor || ''}>
                            {(p.contractor || '').length > 25
                              ? (p.contractor || '').slice(0, 25) + '...'
                              : p.contractor || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-[#d4af37] font-mono text-xs">{fmtCurrency(p.contract_value)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={isPastDue ? 'text-red-400 font-semibold' : 'text-[#94a3b8]'}>
                            {fmtDate(p.project_end_date)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ProgressBar pct={p.completion_pct} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {p.has_images > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[#64748b] text-xs">
                              <Camera className="h-3.5 w-3.5" />
                              {p.has_images}
                            </span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && <ProjectDetail project={p} />}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#2d3a52]">
            <span className="text-[#64748b] text-sm">
              Showing {(page - 1) * limit + 1}-{Math.min(page * limit, totalCount)} of {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-navy px-3 py-1.5 text-sm disabled:opacity-30"
              >
                Prev
              </button>
              <span className="text-[#94a3b8] text-sm">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-navy px-3 py-1.5 text-sm disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── KPI Card Component ─────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  onClick,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: 'gold' | 'red' | 'green' | 'blue' | 'grey';
  onClick?: () => void;
  active?: boolean;
}) {
  const colors = {
    gold: { bg: 'bg-[#d4af37]/20', text: 'text-[#d4af37]' },
    red: { bg: 'bg-red-500/20', text: 'text-red-400' },
    green: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
    blue: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
    grey: { bg: 'bg-[#4a5568]/20', text: 'text-[#94a3b8]' },
  };
  const c = colors[color];

  return (
    <div
      onClick={onClick}
      className={[
        'card-premium p-5 transition-all duration-200 select-none',
        'cursor-pointer hover:brightness-125 hover:border-[#d4af37]/50 hover:shadow-[0_0_12px_rgba(212,175,55,0.15)]',
        active
          ? 'border-[#d4af37]/70 shadow-[0_0_16px_rgba(212,175,55,0.2)] brightness-110'
          : '',
      ].join(' ')}
    >
      <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center mb-3`}>
        <Icon className={`h-5 w-5 ${c.text}`} />
      </div>
      <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
      <p className="text-[#64748b] text-xs mt-1">{label}</p>
    </div>
  );
}

// Need React import for Fragment
import React from 'react';
