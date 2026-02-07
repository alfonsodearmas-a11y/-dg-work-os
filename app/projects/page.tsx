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
  ChevronRight,
  RefreshCw,
  Loader2,
  Search,
  Filter,
  Camera,
  X,
  CircleDot,
  SlidersHorizontal,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useIsMobile } from '@/hooks/useIsMobile';

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

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB Vercel limit

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ project_count: number; agency_counts: Record<string, number>; total_value: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleFile(f: File) {
    if (f.size > MAX_FILE_SIZE) {
      setError('File too large. Maximum 4.5MB.');
      return;
    }
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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card-premium p-4 md:p-6 w-full max-w-lg md:mx-4 rounded-t-2xl md:rounded-2xl max-h-[90vh] md:max-h-none overflow-y-auto" onClick={e => e.stopPropagation()}>
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
  const safePct = pct ?? 0;
  const color = safePct >= 100 ? 'bg-emerald-500' : safePct >= 80 ? 'bg-emerald-500' : safePct >= 40 ? 'bg-amber-500' : safePct > 0 ? 'bg-red-500' : 'bg-[#2d3a52]';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-[#2d3a52] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(safePct, 100)}%` }} />
      </div>
      <span className="text-xs text-[#94a3b8] w-8 text-right">{safePct}%</span>
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

// ── Status sort priority ──────────────────────────────────────────────────

const STATUS_ORDER: Record<string, number> = { Delayed: 0, 'In Progress': 1, 'Not Started': 2, Complete: 3 };

function sortByStatusPriority(a: Project, b: Project): number {
  const oa = STATUS_ORDER[a.status] ?? 9;
  const ob = STATUS_ORDER[b.status] ?? 9;
  if (oa !== ob) return oa - ob;
  if (a.status === 'Delayed') return b.days_overdue - a.days_overdue;
  if (a.status === 'In Progress') return b.completion_pct - a.completion_pct;
  return 0;
}

const STATUS_DOT: Record<string, string> = {
  Complete: 'bg-emerald-400',
  Delayed: 'bg-red-400',
  'In Progress': 'bg-blue-400',
  'Not Started': 'bg-[#64748b]',
};

// ── Inline Agency Project List ────────────────────────────────────────────

function AgencyProjectList({
  agencyCode,
  statusFilter,
  onShowAll,
}: {
  agencyCode: string;
  statusFilter: string;
  onShowAll: (agency: string, status: string) => void;
}) {
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const INLINE_LIMIT = 15;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ agency: agencyCode, limit: '200' });
    fetch(`/api/projects/list?${params}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setItems((data.projects || []) as Project[]);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agencyCode]);

  if (loading) {
    return (
      <div className="px-5 py-6 flex items-center justify-center gap-2 text-[#64748b] text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading projects...
      </div>
    );
  }

  let filtered = statusFilter ? items.filter(p => p.status === statusFilter) : items;
  filtered = [...filtered].sort(sortByStatusPriority);
  const displayCount = showAll ? filtered.length : Math.min(INLINE_LIMIT, filtered.length);
  const visible = filtered.slice(0, displayCount);
  const hasMore = filtered.length > INLINE_LIMIT && !showAll;

  if (filtered.length === 0) {
    return (
      <div className="px-5 py-4 text-[#64748b] text-sm">
        No {statusFilter ? statusFilter.toLowerCase() : ''} projects found.
      </div>
    );
  }

  return (
    <div className="bg-[#0a1628]/40">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[#64748b] text-[10px] uppercase border-b border-[#2d3a52]/50">
            <th className="pl-8 pr-2 py-2 text-left font-medium w-5"></th>
            <th className="px-2 py-2 text-left font-medium">Project Name</th>
            <th className="px-2 py-2 text-left font-medium">Contractor</th>
            <th className="px-2 py-2 text-right font-medium">Value</th>
            <th className="px-2 py-2 text-left font-medium">End Date</th>
            <th className="px-2 py-2 text-left font-medium">Completion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#2d3a52]/30">
          {visible.map(p => {
            const dot = STATUS_DOT[p.status] || STATUS_DOT['Not Started'];
            const isPastDue = p.status === 'Delayed';
            return (
              <tr key={p.id} className="hover:bg-[#1a2744]/30 transition-colors">
                <td className="pl-8 pr-2 py-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${dot}`} title={p.status} />
                </td>
                <td className="px-2 py-2">
                  <span className="text-white block max-w-[260px] truncate" title={p.project_name || ''}>
                    {(p.project_name || '').length > 50 ? (p.project_name || '').slice(0, 50) + '...' : p.project_name || '-'}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <span className="text-[#94a3b8] block max-w-[140px] truncate" title={p.contractor || ''}>
                    {(p.contractor || '').length > 25 ? (p.contractor || '').slice(0, 25) + '...' : p.contractor || '-'}
                  </span>
                </td>
                <td className="px-2 py-2 text-right">
                  <span className="text-[#d4af37] font-mono">{fmtCurrency(p.contract_value)}</span>
                </td>
                <td className="px-2 py-2">
                  <span className={isPastDue ? 'text-red-400 font-semibold' : 'text-[#94a3b8]'}>
                    {fmtDate(p.project_end_date)}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <ProgressBar pct={p.completion_pct} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasMore && (
        <div className="px-5 py-2.5 border-t border-[#2d3a52]/30 flex items-center justify-between">
          <button onClick={() => setShowAll(true)} className="text-[#d4af37] hover:text-[#e5c04b] text-xs font-medium flex items-center gap-1">
            Show all {filtered.length} projects <ChevronDown className="h-3 w-3" />
          </button>
          <button
            onClick={() => onShowAll(agencyCode, statusFilter)}
            className="text-[#64748b] hover:text-white text-xs flex items-center gap-1"
          >
            Open in full table <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Mobile Project Card (replaces table rows on mobile) ──────────────────

function MobileProjectCard({ project, onExpand, isExpanded }: { project: Project; onExpand: () => void; isExpanded: boolean }) {
  const ss = STATUS_STYLES[project.status] || STATUS_STYLES['Not Started'];
  const isPastDue = project.status === 'Delayed';

  return (
    <div className="mobile-card touch-active" onClick={onExpand}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <Badge variant={ss.variant}>{ss.label}</Badge>
        {project.sub_agency && (
          <span className="text-[#d4af37] text-xs font-medium px-2 py-0.5 rounded bg-[#d4af37]/10">{project.sub_agency}</span>
        )}
      </div>
      <p className="text-white font-medium text-sm line-clamp-2 mb-2">{project.project_name || '-'}</p>
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="text-[#94a3b8] truncate mr-2">{project.contractor || '-'}</span>
        <span className="text-[#94a3b8]">{fmtRegion(project.region)}</span>
      </div>
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="text-[#d4af37] font-semibold">{fmtCurrency(project.contract_value)}</span>
        <span className={isPastDue ? 'text-red-400 font-semibold' : 'text-[#94a3b8]'}>
          {fmtDate(project.project_end_date)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-[#2d3a52] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              (project.completion_pct ?? 0) >= 100 ? 'bg-emerald-500'
              : (project.completion_pct ?? 0) >= 40 ? 'bg-amber-500'
              : (project.completion_pct ?? 0) > 0 ? 'bg-red-500'
              : 'bg-[#2d3a52]'
            }`}
            style={{ width: `${Math.min(project.completion_pct ?? 0, 100)}%` }}
          />
        </div>
        <span className="text-xs text-[#94a3b8] w-8 text-right">{project.completion_pct ?? 0}%</span>
        {project.has_images > 0 && (
          <span className="text-[#64748b] text-xs flex items-center gap-0.5">
            <Camera className="h-3 w-3" />{project.has_images}
          </span>
        )}
      </div>
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-[#2d3a52]/50 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[#64748b]">Project ID</span>
            <span className="text-[#94a3b8] font-mono">{project.project_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#64748b]">Executing Agency</span>
            <span className="text-white">{project.executing_agency || '-'}</span>
          </div>
          {project.days_overdue > 0 && (
            <div className="flex justify-between">
              <span className="text-[#64748b]">Days Overdue</span>
              <span className="text-red-400 font-semibold">{project.days_overdue} days</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Mobile Filter Bottom Sheet ───────────────────────────────────────────

function MobileFilterSheet({
  open,
  onClose,
  agency, setAgency,
  status, setStatus,
  region, setRegion,
  search, setSearch,
  sort, setSort,
  regions,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  agency: string; setAgency: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  region: string; setRegion: (v: string) => void;
  search: string; setSearch: (v: string) => void;
  sort: string; setSort: (v: string) => void;
  regions: string[];
  onClear: () => void;
}) {
  if (!open) return null;

  return (
    <>
      <div className="bottom-sheet-backdrop" onClick={onClose} />
      <div className={`bottom-sheet ${open ? 'open' : ''}`}>
        <div className="bottom-sheet-handle" />
        <div className="px-4 pb-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-semibold text-lg">Filters</h3>
            <button onClick={onClear} className="text-[#d4af37] text-sm">Clear All</button>
          </div>

          {/* Search */}
          <div>
            <label className="text-[#64748b] text-xs uppercase tracking-wider mb-1 block">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
              <input
                type="text"
                placeholder="Projects, contractors, IDs..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg pl-9 pr-3 py-3 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none"
              />
            </div>
          </div>

          {/* Agency */}
          <div>
            <label className="text-[#64748b] text-xs uppercase tracking-wider mb-1 block">Agency</label>
            <select
              value={agency}
              onChange={e => setAgency(e.target.value)}
              className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-3 text-sm text-white focus:border-[#d4af37] focus:outline-none"
            >
              <option value="">All Agencies</option>
              {Object.keys(AGENCY_NAMES).map(ag => <option key={ag} value={ag}>{ag}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="text-[#64748b] text-xs uppercase tracking-wider mb-1 block">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-3 text-sm text-white focus:border-[#d4af37] focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="In Progress">In Progress</option>
              <option value="Delayed">Delayed</option>
              <option value="Complete">Complete</option>
              <option value="Not Started">Not Started</option>
            </select>
          </div>

          {/* Region */}
          <div>
            <label className="text-[#64748b] text-xs uppercase tracking-wider mb-1 block">Region</label>
            <select
              value={region}
              onChange={e => setRegion(e.target.value)}
              className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-3 text-sm text-white focus:border-[#d4af37] focus:outline-none"
            >
              <option value="">All Regions</option>
              {regions.map(r => <option key={r} value={r}>Region {parseInt(r, 10)}</option>)}
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="text-[#64748b] text-xs uppercase tracking-wider mb-1 block">Sort By</label>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-3 text-sm text-white focus:border-[#d4af37] focus:outline-none"
            >
              <option value="value">Value</option>
              <option value="completion">Completion %</option>
              <option value="end_date">End Date</option>
              <option value="agency">Agency</option>
              <option value="name">Name</option>
            </select>
          </div>

          {/* Apply button */}
          <button onClick={onClose} className="btn-gold w-full py-3 text-sm mt-2">
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const isMobile = useIsMobile();

  // Data
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // UI
  const [showUpload, setShowUpload] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [expandedAgency, setExpandedAgency] = useState<string | null>(null);
  const [agencyStatusFilter, setAgencyStatusFilter] = useState('');

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
            <h1 className="text-xl md:text-3xl font-bold text-white">Project Tracker</h1>
            <p className="text-[#64748b] mt-1 text-xs md:text-sm">Capital projects from oversight.gov.gy</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 md:gap-4">
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
        <div className="flex items-center justify-between p-3 md:p-4 rounded-xl bg-red-500/10 border border-red-500/30 sticky top-14 md:top-16 z-30 md:static">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-red-400 shrink-0" />
            <p className="text-red-400 font-semibold text-sm md:text-base truncate">
              <span className="md:hidden">{summary.delayed} delayed projects</span>
              <span className="hidden md:inline">
                {summary.delayed} projects are past their deadline
                {summary.delayed_value > 0 && <span className="font-normal text-red-400/80"> — worth {fmtCurrency(summary.delayed_value)}</span>}
              </span>
            </p>
          </div>
          <button onClick={showDelayed} className="btn-navy text-sm px-3 py-1.5 shrink-0">
            View
          </button>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold text-white">Project Tracker</h1>
          <p className="text-[#64748b] mt-1 text-xs md:text-sm">Capital projects from oversight.gov.gy</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <button onClick={handleRefresh} className="btn-navy flex items-center gap-2 px-2.5 py-1.5 md:px-4 md:py-2">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden md:inline">Refresh</span>
          </button>
          <button onClick={() => setShowUpload(true)} className="btn-gold flex items-center gap-2 px-2.5 py-1.5 md:px-4 md:py-2">
            <Upload className="h-4 w-4" />
            <span className="hidden md:inline">Upload Excel</span>
          </button>
        </div>
      </div>

      {/* ── Portfolio Summary KPI Cards ── */}
      {summary && (
        <div className={isMobile ? 'scroll-snap-x pb-1' : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4'}>
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

      {/* ── Agency Breakdown (Accordion) ── */}
      {summary && summary.agencies.length > 0 && (
        <div className="card-premium overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2d3a52]">
            <h2 className="text-white font-semibold">Agency Breakdown</h2>
          </div>
          <div className="divide-y divide-[#2d3a52]">
            {summary.agencies.map(a => {
              const isOpen = expandedAgency === a.agency;

              function toggleAgency() {
                if (isOpen) {
                  setExpandedAgency(null);
                  setAgencyStatusFilter('');
                } else {
                  setExpandedAgency(a.agency);
                  setAgencyStatusFilter('');
                }
              }

              function expandWithStatus(s: string) {
                setExpandedAgency(a.agency);
                setAgencyStatusFilter(s);
              }

              function handleShowAll(ag: string, st: string) {
                setAgency(ag);
                if (st) setStatus(st);
                scrollToTable();
              }

              return (
                <div key={a.agency}>
                  {/* Row header */}
                  <button
                    onClick={toggleAgency}
                    className={`w-full px-3 md:px-5 py-3 flex items-center justify-between hover:bg-[#1a2744]/60 transition-colors cursor-pointer touch-active min-h-[56px] ${isOpen ? 'bg-[#1a2744]/40 border-l-2 border-l-[#d4af37]' : ''}`}
                  >
                    <div className="flex items-center gap-3 md:gap-4 min-w-0 text-left">
                      <div className="shrink-0">
                        <span className="text-[#d4af37] font-bold text-sm">{a.agency}</span>
                        <p className="text-[#64748b] text-xs hidden md:block">{AGENCY_NAMES[a.agency] || a.agency}</p>
                      </div>
                    </div>
                    {/* Desktop stats row */}
                    <div className="hidden md:flex items-center gap-6 text-sm">
                      <div className="text-right">
                        <span className="text-white font-semibold">{a.total}</span>
                        <span className="text-[#64748b] ml-1 text-xs">projects</span>
                      </div>
                      <div className="text-right w-20">
                        <span className="text-[#d4af37] font-semibold">{fmtCurrency(a.total_value)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs" onClick={e => e.stopPropagation()}>
                        {a.delayed > 0 && (
                          <button onClick={() => expandWithStatus('Delayed')} className="text-red-400 hover:text-red-300 hover:underline">
                            {a.delayed} delayed
                          </button>
                        )}
                        {a.complete > 0 && (
                          <button onClick={() => expandWithStatus('Complete')} className="text-emerald-400 hover:text-emerald-300 hover:underline">
                            {a.complete} done
                          </button>
                        )}
                        {a.in_progress > 0 && (
                          <button onClick={() => expandWithStatus('In Progress')} className="text-blue-400 hover:text-blue-300 hover:underline">
                            {a.in_progress} active
                          </button>
                        )}
                      </div>
                      <ChevronDown className={`h-4 w-4 text-[#64748b] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                    {/* Mobile stats row — compact */}
                    <div className="md:hidden flex items-center gap-2 text-xs">
                      <span className="text-white font-semibold">{a.total}</span>
                      <span className="text-[#d4af37] font-semibold">{fmtCurrency(a.total_value)}</span>
                      {a.delayed > 0 && <span className="text-red-400">{a.delayed}!</span>}
                      <ChevronDown className={`h-4 w-4 text-[#64748b] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* Expanded inline project list */}
                  <div
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                    style={{ maxHeight: isOpen ? '2000px' : '0px', opacity: isOpen ? 1 : 0 }}
                  >
                    {isOpen && (
                      <>
                        {/* Status filter pills */}
                        {(a.delayed + a.in_progress + a.complete + a.not_started > 0) && (
                          <div className="px-5 py-2 bg-[#0a1628]/60 border-t border-[#2d3a52]/50 flex items-center gap-2 flex-wrap">
                            <span className="text-[#64748b] text-[10px] uppercase tracking-wider mr-1">Filter:</span>
                            <button
                              onClick={() => setAgencyStatusFilter('')}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${!agencyStatusFilter ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}
                            >
                              All ({a.total})
                            </button>
                            {a.delayed > 0 && (
                              <button
                                onClick={() => setAgencyStatusFilter(agencyStatusFilter === 'Delayed' ? '' : 'Delayed')}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${agencyStatusFilter === 'Delayed' ? 'bg-red-500/20 text-red-400' : 'text-[#64748b] hover:text-red-400'}`}
                              >
                                Delayed ({a.delayed})
                              </button>
                            )}
                            {a.in_progress > 0 && (
                              <button
                                onClick={() => setAgencyStatusFilter(agencyStatusFilter === 'In Progress' ? '' : 'In Progress')}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${agencyStatusFilter === 'In Progress' ? 'bg-blue-500/20 text-blue-400' : 'text-[#64748b] hover:text-blue-400'}`}
                              >
                                In Progress ({a.in_progress})
                              </button>
                            )}
                            {a.complete > 0 && (
                              <button
                                onClick={() => setAgencyStatusFilter(agencyStatusFilter === 'Complete' ? '' : 'Complete')}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${agencyStatusFilter === 'Complete' ? 'bg-emerald-500/20 text-emerald-400' : 'text-[#64748b] hover:text-emerald-400'}`}
                              >
                                Complete ({a.complete})
                              </button>
                            )}
                            {a.not_started > 0 && (
                              <button
                                onClick={() => setAgencyStatusFilter(agencyStatusFilter === 'Not Started' ? '' : 'Not Started')}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${agencyStatusFilter === 'Not Started' ? 'bg-[#4a5568]/30 text-[#94a3b8]' : 'text-[#64748b] hover:text-[#94a3b8]'}`}
                              >
                                Not Started ({a.not_started})
                              </button>
                            )}
                          </div>
                        )}
                        <AgencyProjectList
                          agencyCode={a.agency}
                          statusFilter={agencyStatusFilter}
                          onShowAll={handleShowAll}
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Filters Bar ── */}
      {/* Mobile: filter button + bottom sheet */}
      {isMobile ? (
        <>
          <button
            onClick={() => setShowFilters(true)}
            className="card-premium p-3 w-full flex items-center justify-between touch-active"
          >
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-[#d4af37]" />
              <span className="text-white text-sm font-medium">Filters</span>
              {(agency || status || region || search) && (
                <span className="bg-[#d4af37] text-[#0a1628] text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {[agency, status, region, search].filter(Boolean).length}
                </span>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-[#64748b]" />
          </button>
          <MobileFilterSheet
            open={showFilters}
            onClose={() => setShowFilters(false)}
            agency={agency} setAgency={setAgency}
            status={status} setStatus={setStatus}
            region={region} setRegion={setRegion}
            search={search} setSearch={setSearch}
            sort={sort} setSort={setSort}
            regions={regions}
            onClear={() => { clearFilters(); setShowFilters(false); }}
          />
        </>
      ) : (
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
      )}

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

      {/* ── Project List ── */}
      <div className={`${!activeFilterLabel ? 'scroll-mt-4' : ''}`} ref={!activeFilterLabel ? tableRef : undefined}>
        {isMobile ? (
          /* ── Mobile: Card List ── */
          <div className="space-y-3">
            {loadingProjects ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="mobile-card animate-pulse">
                  <div className="h-5 bg-[#2d3a52] rounded w-20 mb-2" />
                  <div className="h-4 bg-[#2d3a52] rounded w-full mb-2" />
                  <div className="h-3 bg-[#2d3a52] rounded w-2/3 mb-2" />
                  <div className="h-1.5 bg-[#2d3a52] rounded w-full" />
                </div>
              ))
            ) : projects.length === 0 ? (
              <div className="card-premium p-8 text-center text-[#64748b]">
                {summary && summary.total_projects > 0 ? 'No projects match your filters.' : 'No projects yet. Upload an Excel file to get started.'}
              </div>
            ) : (
              projects.map(p => (
                <MobileProjectCard
                  key={p.id}
                  project={p}
                  onExpand={() => setExpandedRow(expandedRow === p.id ? null : p.id)}
                  isExpanded={expandedRow === p.id}
                />
              ))
            )}
          </div>
        ) : (
          /* ── Desktop: Full Table ── */
          <div className="card-premium overflow-hidden">
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
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-2 md:px-4 py-3 mt-2 md:mt-0 md:border-t md:border-[#2d3a52]">
            <span className="text-[#64748b] text-xs md:text-sm">
              {(page - 1) * limit + 1}-{Math.min(page * limit, totalCount)} of {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-navy px-3 py-1.5 text-sm disabled:opacity-30 touch-active"
              >
                Prev
              </button>
              <span className="text-[#94a3b8] text-xs md:text-sm">{page}/{totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-navy px-3 py-1.5 text-sm disabled:opacity-30 touch-active"
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
        'card-premium p-3 md:p-5 transition-all duration-200 select-none touch-active min-w-[130px] md:min-w-0',
        'cursor-pointer hover:brightness-125 hover:border-[#d4af37]/50 hover:shadow-[0_0_12px_rgba(212,175,55,0.15)]',
        active
          ? 'border-[#d4af37]/70 shadow-[0_0_16px_rgba(212,175,55,0.2)] brightness-110'
          : '',
      ].join(' ')}
    >
      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg ${c.bg} flex items-center justify-center mb-2 md:mb-3`}>
        <Icon className={`h-4 w-4 md:h-5 md:w-5 ${c.text}`} />
      </div>
      <p className={`text-xl md:text-2xl font-bold ${c.text}`}>{value}</p>
      <p className="text-[#64748b] text-[11px] md:text-xs mt-1">{label}</p>
    </div>
  );
}

// Need React import for Fragment
import React from 'react';
