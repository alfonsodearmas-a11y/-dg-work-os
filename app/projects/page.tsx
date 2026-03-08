'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Upload, AlertTriangle, Building2, DollarSign, Clock, CheckCircle,
  ChevronDown, ChevronUp, ChevronRight, RefreshCw, Loader2, Search,
  Filter, Camera, X, CircleDot, SlidersHorizontal, Shield, ShieldAlert,
  Download, BarChart3, List, GanttChart, Bookmark, BookmarkPlus, Trash2,
  MessageSquare, Sparkles, AlertCircle, ArrowUpDown, Square, CheckSquare,
  Send, Flag, XCircle,
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
  health: 'green' | 'amber' | 'red';
  escalated: boolean;
  escalation_reason: string | null;
  assigned_to: string | null;
  start_date: string | null;
  revised_start_date: string | null;
  project_status: string | null;
  created_at: string;
  updated_at: string;
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
  at_risk: number;
  agencies: AgencySummary[];
  regions: Record<string, number>;
}

interface ProjectNote {
  id: string;
  project_id: string;
  user_id: string;
  note_text: string;
  note_type: 'general' | 'escalation' | 'status_update';
  created_at: string;
  user_name?: string;
  user_role?: string;
}

interface ProjectSummaryData {
  id: string;
  project_id: string;
  summary: {
    status_snapshot: string;
    timeline_assessment: string;
    budget_position: string;
    key_risks: string[];
    recommended_actions: string[];
  };
  generated_at: string;
}

interface SavedFilter {
  id: string;
  filter_name: string;
  filter_params: Record<string, any>;
  created_at: string;
}

type ViewMode = 'list' | 'timeline';

// ── Constants ──────────────────────────────────────────────────────────────

const AGENCY_OPTIONS = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'MOPUA', 'HAS'];

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

const REGION_OPTIONS = [
  { value: '01', label: 'Region 1' }, { value: '02', label: 'Region 2' },
  { value: '03', label: 'Region 3' }, { value: '04', label: 'Region 4 (Georgetown)' },
  { value: '05', label: 'Region 5' }, { value: '06', label: 'Region 6' },
  { value: '07', label: 'Region 7' }, { value: '08', label: 'Region 8' },
  { value: '09', label: 'Region 9' }, { value: '10', label: 'Region 10' },
];

const STATUS_STYLES: Record<string, { variant: 'success' | 'danger' | 'info' | 'default' | 'warning'; label: string }> = {
  Commenced: { variant: 'info', label: 'Commenced' },
  Delayed: { variant: 'danger', label: 'Delayed' },
  Awarded: { variant: 'warning', label: 'Awarded' },
  Designed: { variant: 'default', label: 'Designed' },
  Completed: { variant: 'success', label: 'Completed' },
  Rollover: { variant: 'warning', label: 'Rollover' },
  Cancelled: { variant: 'danger', label: 'Cancelled' },
  Unknown: { variant: 'default', label: 'Unknown' },
};

const HEALTH_OPTIONS = [
  { value: 'green', label: 'On Track', color: 'bg-emerald-500' },
  { value: 'amber', label: 'Minor Issues', color: 'bg-amber-500' },
  { value: 'red', label: 'Critical', color: 'bg-red-500' },
];

const STATUS_DOT: Record<string, string> = {
  Commenced: 'bg-blue-400',
  Delayed: 'bg-red-400',
  Awarded: 'bg-amber-400',
  Designed: 'bg-[#64748b]',
  Completed: 'bg-emerald-400',
  Rollover: 'bg-amber-400',
  Cancelled: 'bg-red-600',
  Unknown: 'bg-[#64748b]',
};

const HEALTH_DOT: Record<string, string> = {
  green: 'bg-emerald-400',
  amber: 'bg-amber-400',
  red: 'bg-red-400',
};

// ── Formatting ─────────────────────────────────────────────────────────────

function fmtCurrency(value: number | string | null | undefined, allowZero = false): string {
  if (value === null || value === undefined || value === '-') return '-';
  const num = typeof value === 'string' ? parseFloat(value.replace(/[$,]/g, '')) : Number(value);
  if (isNaN(num)) return '-';
  if (num === 0) return allowZero ? '$0' : '-';
  if (num < 0) return '-';
  // Cap outlier values — anything above $100B GYD is data corruption
  if (num > 1e11) return '-';
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

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Multi-Select Dropdown Component ────────────────────────────────────────

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  renderOption,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (val: string[]) => void;
  renderOption?: (opt: { value: string; label: string }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggle(val: string) {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none flex items-center gap-2 min-w-[130px]"
      >
        <span className="truncate">{selected.length ? `${label} (${selected.length})` : label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-[#64748b] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-[#1a2744] border border-[#2d3a52] rounded-lg shadow-xl z-50 min-w-[200px] max-h-[300px] overflow-y-auto">
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-2 hover:bg-[#0a1628]/60 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="accent-[#d4af37]"
              />
              {renderOption ? renderOption(opt) : <span className="text-white">{opt.label}</span>}
            </label>
          ))}
        </div>
      )}
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

// ── Health Dot ──────────────────────────────────────────────────────────────

function HealthDot({ health }: { health: string }) {
  const dot = HEALTH_DOT[health] || HEALTH_DOT.green;
  const labels: Record<string, string> = { green: 'On Track', amber: 'Minor Issues', red: 'Critical' };
  return (
    <span className="inline-flex items-center gap-1.5" title={labels[health] || health}>
      <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
      <span className="text-xs text-[#94a3b8] hidden lg:inline">{labels[health] || health}</span>
    </span>
  );
}

// ── Upload Modal ───────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 4.5 * 1024 * 1024;

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ project_count: number; agency_counts: Record<string, number>; total_value: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleFile(f: File) {
    if (f.size > MAX_FILE_SIZE) { setError('File too large. Maximum 4.5MB.'); return; }
    setFile(f); setError(''); setPreview(null); setSuccess(''); setUploading(true);
    const fd = new FormData(); fd.append('file', f);
    try {
      const res = await fetch('/api/projects/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setSuccess(`Uploaded ${data.project_count} projects across ${Object.keys(data.agency_counts).length} agencies`);
      setPreview({ project_count: data.project_count, agency_counts: data.agency_counts, total_value: data.total_value });
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setUploading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card-premium p-4 md:p-6 w-full max-w-lg md:mx-4 rounded-t-2xl md:rounded-2xl max-h-[90vh] md:max-h-none overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Upload Project Listings</h2>
          <button onClick={onClose} className="text-[#64748b] hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <label className="upload-zone p-8 text-center cursor-pointer block">
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} disabled={uploading} />
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
                  <span key={ag} className="px-2 py-0.5 rounded bg-[#1a2744] text-xs text-[#94a3b8]">{ag}: {ct}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Escalation Modal ───────────────────────────────────────────────────────

function EscalationModal({ project, onClose, onDone }: { project: Project; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error();
      onDone();
    } catch {
      alert('Failed to escalate project');
    }
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card-premium p-6 w-full max-w-md mx-4 rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Escalate Project</h2>
            <p className="text-[#64748b] text-xs line-clamp-1">{project.project_name}</p>
          </div>
        </div>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Why does this project need escalation?"
          className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-3 text-sm text-white placeholder-[#64748b] focus:border-red-400 focus:outline-none resize-none h-28"
        />
        <div className="flex items-center justify-end gap-3 mt-4">
          <button onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={!reason.trim() || submitting} className="bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500/30 disabled:opacity-40">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Escalate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Save Filter Modal ──────────────────────────────────────────────────────

function SaveFilterModal({ filterParams, onClose, onSaved }: { filterParams: Record<string, any>; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/projects/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter_name: name, filter_params: filterParams }),
      });
      if (!res.ok) throw new Error();
      onSaved();
    } catch { alert('Failed to save filter'); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card-premium p-6 w-full max-w-sm mx-4 rounded-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white mb-4">Save Filter Preset</h2>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. GPL Delayed Projects"
          className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none"
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          autoFocus
        />
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim() || saving} className="btn-gold px-4 py-2 text-sm disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Slide Panel — Project Detail ───────────────────────────────────────────

function ProjectSlidePanel({
  project,
  onClose,
  userRole,
  onEscalate,
  onRefreshList,
}: {
  project: Project;
  onClose: () => void;
  userRole: string;
  onEscalate: (p: Project) => void;
  onRefreshList: () => void;
}) {
  const [summary, setSummary] = useState<ProjectSummaryData | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const canDeescalate = ['dg', 'minister', 'ps'].includes(userRole);

  useEffect(() => {
    // Fetch notes
    fetch(`/api/projects/${project.id}/notes`)
      .then(r => r.json())
      .then(data => setNotes(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingNotes(false));

    // Fetch cached summary
    fetch(`/api/projects/${project.id}/summary`)
      .then(r => r.json())
      .then(data => { if (data?.summary) setSummary(data); })
      .catch(() => {});
  }, [project.id]);

  async function generateSummary(force = false) {
    setLoadingSummary(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (data?.summary) setSummary(data);
    } catch {}
    setLoadingSummary(false);
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_text: newNote }),
      });
      const note = await res.json();
      if (note?.id) {
        setNotes(prev => [note, ...prev]);
        setNewNote('');
      }
    } catch {}
    setAddingNote(false);
  }

  async function handleDeescalate() {
    try {
      const res = await fetch(`/api/projects/${project.id}/escalate`, { method: 'DELETE' });
      if (res.ok) onRefreshList();
    } catch {}
  }

  const ss = STATUS_STYLES[project.status] || STATUS_STYLES['Unknown'];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl bg-[#0f1d32] border-l border-[#2d3a52] shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0f1d32] border-b border-[#2d3a52] px-5 py-4 flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg truncate pr-4">Project Detail</h2>
          <button onClick={onClose} className="text-[#64748b] hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-6">
          {/* Escalation Banner */}
          {project.escalated && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
              <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-400 font-semibold text-sm">Escalated</p>
                <p className="text-red-400/80 text-xs mt-0.5">{project.escalation_reason}</p>
              </div>
              {canDeescalate && (
                <button onClick={handleDeescalate} className="text-red-400/60 hover:text-red-400 text-xs">De-escalate</button>
              )}
            </div>
          )}

          {/* Project Info */}
          <div>
            <h3 className="text-white font-semibold text-base mb-1">{project.project_name || '-'}</h3>
            <p className="text-[#64748b] text-xs font-mono">{project.project_id}</p>
            <div className="flex items-center gap-3 mt-3">
              <Badge variant={ss.variant}>{ss.label}</Badge>
              <HealthDot health={project.health} />
              {project.sub_agency && (
                <span className="text-[#d4af37] text-xs font-medium px-2 py-0.5 rounded bg-[#d4af37]/10">{project.sub_agency}</span>
              )}
            </div>
          </div>

          {/* Key Fields */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-[#64748b] text-xs">Contract Value</span>
              <p className="text-[#d4af37] font-semibold">{fmtCurrency(project.contract_value)}</p>
            </div>
            <div>
              <span className="text-[#64748b] text-xs">Completion</span>
              <div className="mt-0.5"><ProgressBar pct={project.completion_pct} /></div>
            </div>
            <div>
              <span className="text-[#64748b] text-xs">Contractor</span>
              <p className="text-white">{project.contractor || '-'}</p>
            </div>
            <div>
              <span className="text-[#64748b] text-xs">Region</span>
              <p className="text-white">{fmtRegion(project.region)}</p>
            </div>
            <div>
              <span className="text-[#64748b] text-xs">Start Date</span>
              <p className="text-white">{fmtDate(project.start_date)}</p>
              {project.revised_start_date && project.revised_start_date !== project.start_date && (
                <p className="text-[#d4af37] text-[10px] mt-0.5">Revised: {fmtDate(project.revised_start_date)}</p>
              )}
            </div>
            <div>
              <span className="text-[#64748b] text-xs">End Date</span>
              <p className={project.status === 'Delayed' ? 'text-red-400 font-semibold' : 'text-white'}>
                {fmtDate(project.project_end_date)}
              </p>
            </div>
            <div>
              <span className="text-[#64748b] text-xs">Agency</span>
              <p className="text-white">{project.sub_agency || project.executing_agency || '-'}</p>
              {project.executing_agency && project.sub_agency && project.executing_agency !== project.sub_agency && (
                <p className="text-[#4a5568] text-[10px] mt-0.5">under {project.executing_agency}</p>
              )}
            </div>
            {project.days_overdue > 0 && (
              <div>
                <span className="text-[#64748b] text-xs">Days Overdue</span>
                <p className="text-red-400 font-semibold">{project.days_overdue} days</p>
              </div>
            )}
          </div>

          {/* Actions */}
          {!project.escalated && (
            <button
              onClick={() => onEscalate(project)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm hover:bg-red-500/20 transition-colors w-full justify-center"
            >
              <Flag className="h-4 w-4" /> Escalate Project
            </button>
          )}

          {/* AI Summary */}
          <div className="card-premium p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#d4af37]" />
                <h4 className="text-white font-semibold text-sm">AI Summary</h4>
              </div>
              <button
                onClick={() => generateSummary(!!summary)}
                disabled={loadingSummary}
                className="text-[#d4af37] text-xs hover:text-[#e5c04b] flex items-center gap-1"
              >
                {loadingSummary ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {summary ? 'Regenerate' : 'Generate'}
              </button>
            </div>

            {loadingSummary ? (
              <div className="space-y-3 animate-pulse">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-4 bg-[#2d3a52] rounded w-full" />)}
              </div>
            ) : summary?.summary ? (
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-[#64748b] text-xs uppercase tracking-wider">Status Snapshot</span>
                  <p className="text-[#94a3b8] mt-0.5">{summary.summary.status_snapshot}</p>
                </div>
                <div>
                  <span className="text-[#64748b] text-xs uppercase tracking-wider">Timeline</span>
                  <p className="text-[#94a3b8] mt-0.5">{summary.summary.timeline_assessment}</p>
                </div>
                <div>
                  <span className="text-[#64748b] text-xs uppercase tracking-wider">Budget Position</span>
                  <p className="text-[#94a3b8] mt-0.5">{summary.summary.budget_position}</p>
                </div>
                {summary.summary.key_risks?.length > 0 && (
                  <div>
                    <span className="text-[#64748b] text-xs uppercase tracking-wider">Key Risks</span>
                    <ul className="mt-1 space-y-1">
                      {summary.summary.key_risks.map((r, i) => (
                        <li key={i} className="text-red-400/80 text-xs flex items-start gap-1.5">
                          <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.summary.recommended_actions?.length > 0 && (
                  <div>
                    <span className="text-[#64748b] text-xs uppercase tracking-wider">Recommended Actions</span>
                    <ul className="mt-1 space-y-1">
                      {summary.summary.recommended_actions.map((a, i) => (
                        <li key={i} className="text-emerald-400/80 text-xs flex items-start gap-1.5">
                          <CheckCircle className="h-3 w-3 shrink-0 mt-0.5" />{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[#4a5568] text-[10px] mt-2">
                  Generated {summary.generated_at ? timeAgo(summary.generated_at) : ''}
                </p>
              </div>
            ) : (
              <p className="text-[#64748b] text-sm">Click &quot;Generate&quot; to create an AI summary of this project.</p>
            )}
          </div>

          {/* Notes / Activity Log */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-[#d4af37]" />
              <h4 className="text-white font-semibold text-sm">Activity Log</h4>
              <span className="text-[#64748b] text-xs">({notes.length})</span>
            </div>

            {/* Add note */}
            <div className="flex items-start gap-2 mb-4">
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Add a note..."
                rows={2}
                className="flex-1 bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none resize-none"
              />
              <button
                onClick={addNote}
                disabled={!newNote.trim() || addingNote}
                className="btn-gold p-2.5 rounded-lg disabled:opacity-40 shrink-0"
              >
                {addingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>

            {/* Notes list */}
            {loadingNotes ? (
              <div className="space-y-3 animate-pulse">
                {[1, 2].map(i => <div key={i} className="h-12 bg-[#2d3a52] rounded" />)}
              </div>
            ) : notes.length === 0 ? (
              <p className="text-[#64748b] text-sm">No notes yet.</p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {notes.map(n => (
                  <div key={n.id} className={`p-3 rounded-lg text-sm ${n.note_type === 'escalation' ? 'bg-red-500/5 border border-red-500/20' : 'bg-[#0a1628] border border-[#2d3a52]/50'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium text-xs">{n.user_name}</span>
                        <span className="text-[#4a5568] text-[10px]">{n.user_role}</span>
                        {n.note_type === 'escalation' && (
                          <span className="text-red-400 text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10">ESCALATION</span>
                        )}
                      </div>
                      <span className="text-[#4a5568] text-[10px]">{timeAgo(n.created_at)}</span>
                    </div>
                    <p className="text-[#94a3b8] text-xs">{n.note_text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Timeline View ──────────────────────────────────────────────────────────

function TimelineView({ projects, groupBy }: { projects: Project[]; groupBy: 'agency' | 'region' }) {
  // Group projects
  const groups = useMemo(() => {
    const g: Record<string, Project[]> = {};
    for (const p of projects) {
      const key = groupBy === 'agency' ? (p.sub_agency || 'Unknown') : fmtRegion(p.region);
      if (!g[key]) g[key] = [];
      g[key].push(p);
    }
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
  }, [projects, groupBy]);

  // Calculate timeline range
  const now = new Date();
  const dates = projects.flatMap(p => {
    const d: Date[] = [];
    if (p.start_date) d.push(new Date(p.start_date));
    if (p.project_end_date) d.push(new Date(p.project_end_date));
    return d;
  }).filter(d => !isNaN(d.getTime()));

  if (dates.length === 0) {
    return <div className="card-premium p-8 text-center text-[#64748b]">No date data available for timeline view.</div>;
  }

  const minDate = new Date(Math.min(...dates.map(d => d.getTime()), now.getTime() - 365 * 86400000));
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime()), now.getTime() + 180 * 86400000));
  const totalDays = (maxDate.getTime() - minDate.getTime()) / 86400000;

  function getPosition(dateStr: string | null): number {
    if (!dateStr) return 0;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 0;
    return ((d.getTime() - minDate.getTime()) / 86400000 / totalDays) * 100;
  }

  const nowPosition = ((now.getTime() - minDate.getTime()) / 86400000 / totalDays) * 100;

  const healthColor: Record<string, string> = {
    green: 'bg-emerald-500/80',
    amber: 'bg-amber-500/80',
    red: 'bg-red-500/80',
  };

  // Compute tick interval: aim for ~8-12 labels max
  const tickMonths = totalDays <= 180 ? 1 : totalDays <= 365 ? 2 : totalDays <= 730 ? 3 : totalDays <= 1460 ? 6 : 12;
  const ticks: { date: Date; pos: number }[] = [];
  {
    const tickStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    let cursor = new Date(tickStart);
    while (cursor.getTime() <= maxDate.getTime()) {
      const pos = ((cursor.getTime() - minDate.getTime()) / 86400000 / totalDays) * 100;
      if (pos >= 0 && pos <= 100) ticks.push({ date: new Date(cursor), pos });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + tickMonths, 1);
    }
  }

  return (
    <div className="card-premium overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header with months */}
          <div className="flex items-center border-b border-[#2d3a52] px-4 py-2 relative">
            <div className="w-64 shrink-0 text-[#64748b] text-xs font-medium uppercase">Project</div>
            <div className="flex-1 relative h-6">
              {/* Month markers — spaced by computed interval */}
              {ticks.map((t, i) => (
                <span key={i} className="absolute text-[10px] text-[#4a5568] whitespace-nowrap" style={{ left: `${t.pos}%`, transform: 'translateX(-50%)' }}>
                  {t.date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                </span>
              ))}
            </div>
          </div>

          {/* Groups */}
          {groups.map(([groupName, items]) => (
            <div key={groupName}>
              <div className="px-4 py-2 bg-[#0a1628]/60 border-b border-[#2d3a52]/50">
                <span className="text-[#d4af37] text-xs font-semibold">{groupName}</span>
                <span className="text-[#64748b] text-xs ml-2">({items.length})</span>
              </div>
              {items.slice(0, 20).map(p => {
                const start = getPosition(p.start_date || p.created_at);
                const end = getPosition(p.project_end_date);
                const barLeft = Math.min(start, end || start);
                const barWidth = Math.max((end || start + 2) - barLeft, 1);

                return (
                  <div key={p.id} className="flex items-center px-4 py-1.5 border-b border-[#2d3a52]/20 hover:bg-[#1a2744]/30 group/row">
                    <div className="w-64 shrink-0 pr-2 relative">
                      <p className="text-white text-xs truncate">{p.project_name || '-'}</p>
                      {/* Tooltip on hover showing full name */}
                      {p.project_name && p.project_name.length > 35 && (
                        <div className="hidden group-hover/row:block absolute left-0 top-full z-20 mt-1 px-3 py-2 bg-[#1a2744] border border-[#2d3a52] rounded-lg shadow-xl text-white text-xs max-w-sm whitespace-normal">
                          {p.project_name}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 relative h-5">
                      {/* Now line */}
                      <div className="absolute top-0 bottom-0 w-px bg-[#d4af37]/30" style={{ left: `${nowPosition}%` }} />
                      {/* Bar */}
                      <div
                        className={`absolute top-1 h-3 rounded-sm ${healthColor[p.health] || healthColor.green} ${p.escalated ? 'ring-1 ring-red-400' : ''}`}
                        style={{ left: `${barLeft}%`, width: `${barWidth}%`, minWidth: '4px' }}
                        title={`${p.project_name} (${p.completion_pct}%)`}
                      >
                        {barWidth > 5 && (
                          <div className="h-full bg-white/20 rounded-sm" style={{ width: `${Math.min(p.completion_pct, 100)}%` }} />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── KPI Card Component ─────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, color, onClick, active, subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: 'gold' | 'red' | 'green' | 'blue' | 'grey' | 'amber';
  onClick?: () => void;
  active?: boolean;
  subtitle?: string;
}) {
  const colors = {
    gold: { bg: 'bg-[#d4af37]/20', text: 'text-[#d4af37]' },
    red: { bg: 'bg-red-500/20', text: 'text-red-400' },
    green: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
    blue: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
    grey: { bg: 'bg-[#4a5568]/20', text: 'text-[#94a3b8]' },
    amber: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  };
  const c = colors[color];

  return (
    <div
      onClick={onClick}
      className={[
        'card-premium p-3 md:p-5 transition-all duration-200 select-none touch-active min-w-[130px] md:min-w-0',
        onClick ? 'cursor-pointer hover:brightness-125 hover:border-[#d4af37]/50 hover:shadow-[0_0_12px_rgba(212,175,55,0.15)]' : '',
        active ? 'border-[#d4af37]/70 shadow-[0_0_16px_rgba(212,175,55,0.2)] brightness-110' : '',
      ].join(' ')}
    >
      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg ${c.bg} flex items-center justify-center mb-2 md:mb-3`}>
        <Icon className={`h-4 w-4 md:h-5 md:w-5 ${c.text}`} />
      </div>
      <p className={`text-lg md:text-2xl font-bold ${c.text} truncate`}>{value}</p>
      <p className="text-[#64748b] text-xs mt-1">{label}</p>
      {subtitle && <p className="text-[#4a5568] text-[10px] mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ── Bulk Action Bar ────────────────────────────────────────────────────────

function BulkActionBar({
  count,
  onUpdateHealth,
  onExport,
  onClear,
}: {
  count: number;
  onUpdateHealth: (health: string) => void;
  onExport: () => void;
  onClear: () => void;
}) {
  const [showHealthMenu, setShowHealthMenu] = useState(false);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-[#1a2744] border border-[#d4af37]/40 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
      <span className="text-[#d4af37] font-semibold text-sm">{count} selected</span>

      {/* Health */}
      <div className="relative">
        <button onClick={() => setShowHealthMenu(!showHealthMenu)} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1">
          Health <ChevronDown className="h-3 w-3" />
        </button>
        {showHealthMenu && (
          <div className="absolute bottom-full left-0 mb-2 bg-[#1a2744] border border-[#2d3a52] rounded-lg shadow-xl min-w-[140px]">
            {HEALTH_OPTIONS.map(h => (
              <button key={h.value} onClick={() => { onUpdateHealth(h.value); setShowHealthMenu(false); }} className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-white hover:bg-[#0a1628]/60">
                <span className={`w-2 h-2 rounded-full ${h.color}`} />{h.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Export */}
      <button onClick={onExport} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1">
        <Download className="h-3 w-3" /> CSV
      </button>

      {/* Clear */}
      <button onClick={onClear} className="text-[#64748b] hover:text-white">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const userRole = session?.user?.role || 'officer';

  // Data
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [contractors, setContractors] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);

  // UI state
  const [showUpload, setShowUpload] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [showProjectList, setShowProjectList] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [escalateProject, setEscalateProject] = useState<Project | null>(null);
  const [showSaveFilter, setShowSaveFilter] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [timelineGroupBy, setTimelineGroupBy] = useState<'agency' | 'region'>('agency');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cardFilter, setCardFilter] = useState<'at_risk' | 'delayed' | 'complete' | 'active' | null>(null);

  // Filters — initialized from URL params
  const [agencies, setAgencies] = useState<string[]>(() => searchParams.get('agencies')?.split(',').filter(Boolean) || []);
  const [statuses, setStatuses] = useState<string[]>(() => searchParams.get('statuses')?.split(',').filter(Boolean) || []);
  const [regions, setRegions] = useState<string[]>(() => searchParams.get('regions')?.split(',').filter(Boolean) || []);
  const [healths, setHealths] = useState<string[]>(() => searchParams.get('healths')?.split(',').filter(Boolean) || []);
  const [budgetMin, setBudgetMin] = useState(searchParams.get('budgetMin') || '');
  const [budgetMax, setBudgetMax] = useState(searchParams.get('budgetMax') || '');
  const [contractor, setContractor] = useState(searchParams.get('contractor') || '');
  const [dateField, setDateField] = useState(searchParams.get('dateField') || 'project_end_date');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || '');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'value');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const limit = 25;
  const tableRef = useRef<HTMLDivElement>(null);

  // Build URL params from current filters
  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (agencies.length) p.set('agencies', agencies.join(','));
    if (statuses.length) p.set('statuses', statuses.join(','));
    if (regions.length) p.set('regions', regions.join(','));
    if (healths.length) p.set('healths', healths.join(','));
    if (budgetMin) p.set('budgetMin', budgetMin);
    if (budgetMax) p.set('budgetMax', budgetMax);
    if (contractor) p.set('contractor', contractor);
    if (dateField !== 'project_end_date') p.set('dateField', dateField);
    if (dateFrom) p.set('dateFrom', dateFrom);
    if (dateTo) p.set('dateTo', dateTo);
    if (search) p.set('search', search);
    if (sort !== 'value') p.set('sort', sort);
    if (page > 1) p.set('page', String(page));
    return p;
  }, [agencies, statuses, regions, healths, budgetMin, budgetMax, contractor, dateField, dateFrom, dateTo, search, sort, page]);

  // Sync filters to URL
  useEffect(() => {
    const params = buildParams();
    const str = params.toString();
    const current = searchParams.toString();
    if (str !== current) {
      router.replace(`/projects${str ? '?' + str : ''}`, { scroll: false });
    }
  }, [buildParams]);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    try {
      const params = buildParams();
      params.delete('page');
      params.delete('sort');
      const res = await fetch(`/api/projects/summary?${params}`);
      const data = await res.json();
      if (data.total_projects !== undefined) setSummary(data);
    } catch {}
  }, [buildParams]);

  // Fetch projects
  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const params = buildParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      const res = await fetch(`/api/projects/list?${params}`);
      const data = await res.json();
      setProjects(data.projects || []);
      setTotalCount(data.total || 0);
    } catch {}
    setLoadingProjects(false);
  }, [buildParams, page]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchSummary(), fetchProjects()]).finally(() => setLoading(false));
    // Load contractors, statuses, and saved filters
    fetch('/api/projects/contractors').then(r => r.json()).then(d => { if (Array.isArray(d)) setContractors(d); }).catch(() => {});
    fetch('/api/projects/statuses').then(r => r.json()).then(d => { if (Array.isArray(d)) setStatusOptions(d.map((s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())); }).catch(() => {});
    fetch('/api/projects/filters').then(r => r.json()).then(d => { if (Array.isArray(d)) setSavedFilters(d); }).catch(() => {});
  }, []);

  // Refetch on filter change
  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { fetchSummary(); }, [agencies, statuses, regions, healths, budgetMin, budgetMax, contractor, search]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [agencies, statuses, regions, healths, budgetMin, budgetMax, contractor, dateField, dateFrom, dateTo, search, sort]);

  function toggleCardFilter(filter: 'at_risk' | 'delayed' | 'complete' | 'active') {
    if (cardFilter === filter) {
      // Clear card filter — restore previous filter state
      setCardFilter(null);
      setStatuses([]);
      setHealths([]);
    } else {
      setCardFilter(filter);
      if (filter === 'delayed') {
        setStatuses(['Delayed']);
        setHealths([]);
      } else if (filter === 'at_risk') {
        setStatuses([]);
        setHealths(['amber', 'red']);
      } else if (filter === 'complete') {
        setStatuses(['Completed']);
        setHealths([]);
      } else if (filter === 'active') {
        // Show all — clear filters
        setStatuses([]);
        setHealths([]);
      }
    }
  }

  function clearFilters() {
    setCardFilter(null);
    setAgencies([]); setStatuses([]); setRegions([]); setHealths([]);
    setBudgetMin(''); setBudgetMax(''); setContractor('');
    setDateField('project_end_date'); setDateFrom(''); setDateTo('');
    setSearch(''); setSort('value');
  }

  function handleRefresh() {
    setLoading(true);
    Promise.all([fetchSummary(), fetchProjects()]).finally(() => setLoading(false));
  }

  const hasActiveFilters = agencies.length || statuses.length || regions.length || healths.length || budgetMin || budgetMax || contractor || dateFrom || dateTo || search;
  const activeFilterCount = [agencies.length > 0, statuses.length > 0, regions.length > 0, healths.length > 0, budgetMin || budgetMax, contractor, dateFrom || dateTo, search].filter(Boolean).length;
  const totalPages = Math.ceil(totalCount / limit);

  // Selection helpers
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === projects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map(p => p.id)));
    }
  }

  async function handleBulkUpdate(updates: Record<string, any>) {
    try {
      const res = await fetch('/api/projects/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_ids: Array.from(selectedIds), ...updates }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Update failed');
        return;
      }
      setSelectedIds(new Set());
      handleRefresh();
    } catch { alert('Update failed'); }
  }

  async function handleExport() {
    try {
      const res = await fetch('/api/projects/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_ids: Array.from(selectedIds) }),
      });
      if (!res.ok) { alert('Export failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `projects-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Export failed'); }
  }

  function applySavedFilter(sf: SavedFilter) {
    const fp = sf.filter_params;
    if (fp.agencies) setAgencies(fp.agencies);
    if (fp.statuses) setStatuses(fp.statuses);
    if (fp.regions) setRegions(fp.regions);
    if (fp.healths) setHealths(fp.healths);
    if (fp.budgetMin) setBudgetMin(fp.budgetMin);
    if (fp.budgetMax) setBudgetMax(fp.budgetMax);
    if (fp.contractor) setContractor(fp.contractor);
    if (fp.search) setSearch(fp.search);
    if (fp.sort) setSort(fp.sort);
  }

  async function deleteSavedFilter(id: string) {
    try {
      await fetch('/api/projects/filters', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setSavedFilters(prev => prev.filter(f => f.id !== id));
    } catch {}
  }

  // Current filter params for saving
  const currentFilterParams = useMemo(() => {
    const fp: Record<string, any> = {};
    if (agencies.length) fp.agencies = agencies;
    if (statuses.length) fp.statuses = statuses;
    if (regions.length) fp.regions = regions;
    if (healths.length) fp.healths = healths;
    if (budgetMin) fp.budgetMin = budgetMin;
    if (budgetMax) fp.budgetMax = budgetMax;
    if (contractor) fp.contractor = contractor;
    if (search) fp.search = search;
    if (sort !== 'value') fp.sort = sort;
    return fp;
  }, [agencies, statuses, regions, healths, budgetMin, budgetMax, contractor, search, sort]);

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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
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
      {/* Modals */}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); handleRefresh(); }} />}
      {escalateProject && <EscalationModal project={escalateProject} onClose={() => setEscalateProject(null)} onDone={() => { setEscalateProject(null); handleRefresh(); }} />}
      {showSaveFilter && <SaveFilterModal filterParams={currentFilterParams} onClose={() => setShowSaveFilter(false)} onSaved={() => { setShowSaveFilter(false); fetch('/api/projects/filters').then(r => r.json()).then(d => { if (Array.isArray(d)) setSavedFilters(d); }); }} />}
      {selectedProject && <ProjectSlidePanel project={selectedProject} onClose={() => setSelectedProject(null)} userRole={userRole} onEscalate={p => { setSelectedProject(null); setEscalateProject(p); }} onRefreshList={() => { setSelectedProject(null); handleRefresh(); }} />}

      {/* Page Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold text-white">Project Tracker</h1>
          <p className="text-[#64748b] mt-1 text-xs md:text-sm">Capital projects from oversight.gov.gy</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <button onClick={handleRefresh} className="btn-navy flex items-center gap-2 px-2.5 py-1.5 md:px-4 md:py-2">
            <RefreshCw className="h-4 w-4" /><span className="hidden md:inline">Refresh</span>
          </button>
          <button onClick={() => setShowUpload(true)} className="btn-gold flex items-center gap-2 px-2.5 py-1.5 md:px-4 md:py-2">
            <Upload className="h-4 w-4" /><span className="hidden md:inline">Upload Excel</span>
          </button>
        </div>
      </div>

      {/* Portfolio Dashboard Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          <KpiCard
            icon={Building2}
            label="Active Projects"
            value={String(summary.total_projects)}
            color="gold"
            onClick={() => toggleCardFilter('active')}
            active={cardFilter === 'active'}
          />
          <KpiCard
            icon={DollarSign}
            label="Portfolio Value"
            value={summary.total_value > 0 ? fmtCurrency(summary.total_value) : 'No values recorded'}
            color="gold"
          />
          <KpiCard
            icon={AlertTriangle}
            label="At Risk"
            value={String(summary.at_risk)}
            color="amber"
            subtitle="Amber + Red health"
            onClick={() => toggleCardFilter('at_risk')}
            active={cardFilter === 'at_risk'}
          />
          <KpiCard
            icon={CheckCircle}
            label="Completion Rate"
            value={summary.total_projects > 0 ? `${Math.round((summary.complete / summary.total_projects) * 100)}%` : '0%'}
            color="green"
            subtitle={`${summary.complete} of ${summary.total_projects}`}
            onClick={() => toggleCardFilter('complete')}
            active={cardFilter === 'complete'}
          />
          <KpiCard
            icon={AlertTriangle}
            label="Delayed"
            value={String(summary.delayed)}
            color="red"
            subtitle={summary.delayed_value > 0 ? fmtCurrency(summary.delayed_value) : undefined}
            onClick={() => toggleCardFilter('delayed')}
            active={cardFilter === 'delayed'}
          />
        </div>
      )}

      {/* Regional Spread Mini Chart */}
      {summary && Object.keys(summary.regions).length > 1 && (
        <div className="card-premium p-4">
          <h3 className="text-white text-sm font-semibold mb-3">Regional Spread</h3>
          <div className="flex items-end gap-1 h-16">
            {Object.entries(summary.regions)
              .filter(([k]) => k !== 'Unknown')
              .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
              .map(([reg, count]) => {
                const maxCount = Math.max(...Object.values(summary.regions));
                const h = Math.max((count / maxCount) * 100, 8);
                return (
                  <div key={reg} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[#d4af37] text-[10px] font-medium">{count}</span>
                    <div className="w-full bg-[#d4af37]/30 rounded-t" style={{ height: `${h}%` }} />
                    <span className="text-[#64748b] text-[9px]">R{parseInt(reg)}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Filter Panel */}
      <div className="card-premium">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#1a2744]/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[#d4af37]" />
            <span className="text-white text-sm font-medium">Filters</span>
            {activeFilterCount > 0 && (
              <span className="bg-[#d4af37] text-[#0a1628] text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{activeFilterCount}</span>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 text-[#64748b] transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {showFilters && (
          <div className="px-4 pb-4 space-y-3 border-t border-[#2d3a52]">
            <div className="pt-3 flex flex-wrap items-end gap-3">
              {/* Agency multi-select */}
              <MultiSelect
                label="Agency"
                options={AGENCY_OPTIONS.map(a => ({ value: a, label: a }))}
                selected={agencies}
                onChange={setAgencies}
              />

              {/* Status multi-select */}
              <MultiSelect
                label="Status"
                options={statusOptions.map(s => ({ value: s, label: s }))}
                selected={statuses}
                onChange={v => { setCardFilter(null); setStatuses(v); }}
              />

              {/* Region multi-select */}
              <MultiSelect
                label="Region"
                options={REGION_OPTIONS}
                selected={regions}
                onChange={setRegions}
              />

              {/* Health multi-select */}
              <MultiSelect
                label="Health"
                options={HEALTH_OPTIONS.map(h => ({ value: h.value, label: h.label }))}
                selected={healths}
                onChange={v => { setCardFilter(null); setHealths(v); }}
                renderOption={opt => (
                  <span className="flex items-center gap-2 text-white">
                    <span className={`w-2 h-2 rounded-full ${HEALTH_DOT[opt.value] || ''}`} />{opt.label}
                  </span>
                )}
              />

              {/* Budget Range */}
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  placeholder="Min $"
                  value={budgetMin}
                  onChange={e => setBudgetMin(e.target.value)}
                  className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-2 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none w-24"
                />
                <span className="text-[#64748b] text-xs">-</span>
                <input
                  type="number"
                  placeholder="Max $"
                  value={budgetMax}
                  onChange={e => setBudgetMax(e.target.value)}
                  className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-2 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none w-24"
                />
              </div>

              {/* Contractor */}
              <div className="relative">
                <input
                  type="text"
                  list="contractor-list"
                  value={contractor}
                  onChange={e => setContractor(e.target.value)}
                  placeholder="Contractor..."
                  className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none w-40"
                />
                <datalist id="contractor-list">
                  {contractors.slice(0, 50).map(c => <option key={c} value={c} />)}
                </datalist>
              </div>

              {/* Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
                <input
                  type="text"
                  placeholder="Search projects, contractors, IDs..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none"
                />
              </div>
            </div>

            {/* Date Range Row */}
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={dateField}
                onChange={e => setDateField(e.target.value)}
                className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none"
              >
                <option value="project_end_date">End Date</option>
                <option value="start_date">Start Date</option>
                <option value="updated_at">Last Updated</option>
              </select>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none" />
              <span className="text-[#64748b] text-xs">to</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none" />

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
                <option value="health">Sort: Health</option>
              </select>

              <div className="flex-1" />

              {/* Filter actions */}
              {hasActiveFilters && (
                <>
                  <button onClick={() => setShowSaveFilter(true)} className="text-[#d4af37] text-xs flex items-center gap-1 hover:text-[#e5c04b]">
                    <BookmarkPlus className="h-3.5 w-3.5" /> Save Preset
                  </button>
                  <button onClick={clearFilters} className="text-[#64748b] hover:text-white text-xs flex items-center gap-1">
                    <X className="h-3.5 w-3.5" /> Clear All
                  </button>
                </>
              )}
            </div>

            {/* Saved filter presets */}
            {savedFilters.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Bookmark className="h-3.5 w-3.5 text-[#64748b]" />
                {savedFilters.map(sf => (
                  <div key={sf.id} className="flex items-center gap-1 bg-[#0a1628] border border-[#2d3a52] rounded-lg px-2 py-1">
                    <button onClick={() => applySavedFilter(sf)} className="text-[#d4af37] text-xs hover:text-[#e5c04b]">
                      {sf.filter_name}
                    </button>
                    <button onClick={() => deleteSavedFilter(sf.id)} className="text-[#4a5568] hover:text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active Filter Chip + Count + View Toggle */}
      <div className="flex items-center justify-between gap-3" ref={tableRef}>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#d4af37]/10 border border-[#d4af37]/30 text-sm">
              <Filter className="h-3.5 w-3.5 text-[#d4af37]" />
              <span className="text-[#d4af37]">Showing {summary?.total_projects || totalCount} projects</span>
              <button onClick={clearFilters} className="ml-1 text-[#d4af37]/60 hover:text-[#d4af37]"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          {!hasActiveFilters && summary && (
            <span className="text-[#64748b] text-sm">{summary.total_projects} projects</span>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 bg-[#0a1628] border border-[#2d3a52] rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}
          >
            <List className="h-3.5 w-3.5 inline mr-1" />List
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'timeline' ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}
          >
            <GanttChart className="h-3.5 w-3.5 inline mr-1" />Timeline
          </button>
          {viewMode === 'timeline' && (
            <select
              value={timelineGroupBy}
              onChange={e => setTimelineGroupBy(e.target.value as 'agency' | 'region')}
              className="bg-transparent text-xs text-[#94a3b8] ml-2 focus:outline-none"
            >
              <option value="agency">By Agency</option>
              <option value="region">By Region</option>
            </select>
          )}
        </div>
      </div>

      {/* Project List / Timeline */}
      {viewMode === 'timeline' ? (
        <TimelineView projects={projects} groupBy={timelineGroupBy} />
      ) : (
        <>
          {isMobile ? (
            /* Mobile: Card List */
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
                projects.map(p => {
                  const ss = STATUS_STYLES[p.status] || STATUS_STYLES['Unknown'];
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProject(p)}
                      className={`mobile-card touch-active cursor-pointer ${p.escalated ? 'border-red-500/40 bg-red-500/5' : ''}`}
                    >
                      {p.escalated && (
                        <div className="flex items-center gap-1 mb-2 text-red-400 text-xs">
                          <ShieldAlert className="h-3 w-3" /> Escalated
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={ss.variant}>{ss.label}</Badge>
                          <HealthDot health={p.health} />
                        </div>
                        {p.sub_agency && (
                          <span className="text-[#d4af37] text-xs font-medium px-2 py-0.5 rounded bg-[#d4af37]/10">{p.sub_agency}</span>
                        )}
                      </div>
                      <p className="text-white font-medium text-sm mb-2">{p.project_name || '-'}</p>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-[#d4af37] font-semibold">{fmtCurrency(p.contract_value)}</span>
                        <span className={p.status === 'Delayed' ? 'text-red-400 font-semibold' : 'text-[#94a3b8]'}>{fmtDate(p.project_end_date)}</span>
                      </div>
                      {p.start_date && (
                        <div className="text-[10px] text-[#64748b] mb-2">
                          Start: {fmtDate(p.start_date)}
                          {p.revised_start_date && p.revised_start_date !== p.start_date && (
                            <span className="text-[#d4af37] ml-2">Rev: {fmtDate(p.revised_start_date)}</span>
                          )}
                        </div>
                      )}
                      <ProgressBar pct={p.completion_pct} />
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Desktop: Full Table */
            <div className="card-premium overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2d3a52] text-[#64748b] text-xs uppercase">
                      <th className="px-3 py-3 text-center font-medium w-10">
                        <button onClick={toggleSelectAll} className="text-[#64748b] hover:text-white">
                          {selectedIds.size === projects.length && projects.length > 0 ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                        </button>
                      </th>
                      <th className="px-3 py-3 text-left font-medium">Status</th>
                      <th className="px-3 py-3 text-left font-medium">Health</th>
                      <th className="px-4 py-3 text-left font-medium">Project Name</th>
                      <th className="px-3 py-3 text-left font-medium">Agency</th>
                      <th className="px-3 py-3 text-left font-medium">Region</th>
                      <th className="px-3 py-3 text-left font-medium">Contractor</th>
                      <th className="px-3 py-3 text-right font-medium">Value</th>
                      <th className="px-3 py-3 text-left font-medium">Start Date</th>
                      <th className="px-3 py-3 text-left font-medium">End Date</th>
                      <th className="px-3 py-3 text-left font-medium">Completion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2d3a52]/50">
                    {loadingProjects ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          {Array.from({ length: 11 }).map((_, j) => (
                            <td key={j} className="px-3 py-3"><div className="h-5 bg-[#2d3a52] rounded w-full" /></td>
                          ))}
                        </tr>
                      ))
                    ) : projects.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-12 text-center text-[#64748b]">
                          {summary && summary.total_projects > 0 ? 'No projects match your filters.' : 'No projects yet. Upload an Excel file to get started.'}
                        </td>
                      </tr>
                    ) : (
                      projects.map(p => {
                        const ss = STATUS_STYLES[p.status] || STATUS_STYLES['Unknown'];
                        const isPastDue = p.status === 'Delayed';
                        const isSelected = selectedIds.has(p.id);

                        return (
                          <tr
                            key={p.id}
                            className={`hover:bg-[#1a2744]/40 cursor-pointer transition-colors ${p.escalated ? 'bg-red-500/5 border-l-2 border-l-red-500' : ''} ${isSelected ? 'bg-[#d4af37]/5' : ''}`}
                          >
                            <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                              <button onClick={() => toggleSelect(p.id)} className="text-[#64748b] hover:text-white">
                                {isSelected ? <CheckSquare className="h-4 w-4 text-[#d4af37]" /> : <Square className="h-4 w-4" />}
                              </button>
                            </td>
                            <td className="px-3 py-3" onClick={() => setSelectedProject(p)}>
                              <div className="flex items-center gap-1.5">
                                <Badge variant={ss.variant}>{ss.label}</Badge>
                                {p.escalated && <ShieldAlert className="h-3.5 w-3.5 text-red-400" />}
                              </div>
                            </td>
                            <td className="px-3 py-3" onClick={() => setSelectedProject(p)}>
                              <HealthDot health={p.health} />
                            </td>
                            <td className="px-4 py-3" onClick={() => setSelectedProject(p)}>
                              <span className="text-white line-clamp-2 max-w-[350px]" title={p.project_name || ''}>
                                {p.project_name || '-'}
                              </span>
                            </td>
                            <td className="px-3 py-3" onClick={() => setSelectedProject(p)}>
                              <span className="text-[#d4af37] font-medium text-xs">{p.sub_agency || '-'}</span>
                            </td>
                            <td className="px-3 py-3 text-[#94a3b8]" onClick={() => setSelectedProject(p)}>{fmtRegion(p.region)}</td>
                            <td className="px-3 py-3" onClick={() => setSelectedProject(p)}>
                              <span className="text-[#94a3b8] line-clamp-1 max-w-[180px]" title={p.contractor || ''}>{p.contractor || '-'}</span>
                            </td>
                            <td className="px-3 py-3 text-right" onClick={() => setSelectedProject(p)}>
                              <span className="text-[#d4af37] font-mono text-xs">{fmtCurrency(p.contract_value)}</span>
                            </td>
                            <td className="px-3 py-3" onClick={() => setSelectedProject(p)}>
                              <span className="text-[#94a3b8]">{fmtDate(p.start_date)}</span>
                              {p.revised_start_date && p.revised_start_date !== p.start_date && (
                                <span className="block text-[10px] text-[#d4af37]">Rev: {fmtDate(p.revised_start_date)}</span>
                              )}
                            </td>
                            <td className="px-3 py-3" onClick={() => setSelectedProject(p)}>
                              <span className={isPastDue ? 'text-red-400 font-semibold' : 'text-[#94a3b8]'}>{fmtDate(p.project_end_date)}</span>
                            </td>
                            <td className="px-3 py-3" onClick={() => setSelectedProject(p)}>
                              <ProgressBar pct={p.completion_pct} />
                            </td>
                          </tr>
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
            <div className="flex flex-wrap items-center justify-between px-2 md:px-4 py-3 gap-2">
              <span className="text-[#64748b] text-xs md:text-sm">
                {(page - 1) * limit + 1}-{Math.min(page * limit, totalCount)} of {totalCount}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-navy px-3 py-1.5 text-sm disabled:opacity-30 touch-active">Prev</button>
                <span className="text-[#94a3b8] text-xs md:text-sm">{page}/{totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-navy px-3 py-1.5 text-sm disabled:opacity-30 touch-active">Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onUpdateHealth={h => handleBulkUpdate({ health: h })}
          onExport={handleExport}
          onClear={() => setSelectedIds(new Set())}
        />
      )}
    </div>
  );
}
