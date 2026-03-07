'use client';

import React, { useState, useEffect, useCallback, useMemo, Fragment, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Eye, RefreshCw, AlertTriangle, Clock, ShieldAlert, FileWarning,
  Building2, TrendingUp, ChevronDown, ChevronRight,
  Search, Filter, X, SlidersHorizontal, Upload, DollarSign,
  CheckCircle, CircleDot, List, GanttChart, Flag, Sparkles,
  MessageSquare, Send, Loader2, BookmarkPlus, Bookmark, Trash2,
  Download, Square, CheckSquare, AlertCircle, UserPlus,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useIsMobile } from '@/hooks/useIsMobile';

// ── Scraped Oversight Types ────────────────────────────────────────────────

interface OversightData {
  metadata: {
    generatedAt: string;
    totalProjects: number;
    analysisDate: string;
  };
  dashboard: {
    kpis: {
      totalContractCost: number | null;
      totalContractCostDisplay: string | null;
      totalDisbursement: number | null;
      totalDisbursementDisplay: string | null;
      totalBalance: number | null;
      totalBalanceDisplay: string | null;
      totalProjects: number | null;
      utilizationPercent: number | null;
      engineerEstimate: number | null;
      engineerEstimateDisplay: string | null;
    };
    statusChart: Record<string, { percent: number; count: number } | number | null>;
    scrapedAt: string;
  };
  summary: {
    delayed: number;
    overdue: number;
    endingSoon: number;
    atRisk: number;
    bondWarnings: number;
  };
  delayed: any[];
  overdue: any[];
  endingSoon: any[];
  atRisk: any[];
  bondWarnings: any[];
  agencyBreakdown: {
    agency: string;
    agencyFull: string | null;
    projectCount: number;
    totalValue: number;
    totalValueDisplay: string | null;
    avgCompletion: number | null;
  }[];
  top10: any[];
}

// ── PSIP Project Types ─────────────────────────────────────────────────────

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
  status_override: string | null;
  created_at: string;
  updated_at: string;
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
  agencies: { agency: string; total: number; complete: number; in_progress: number; delayed: number; not_started: number; total_value: number; avg_completion: number }[];
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
type TabMode = 'alerts' | 'projects';

// ── Constants ──────────────────────────────────────────────────────────────

const AGENCY_OPTIONS = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'MOPUA', 'HAS'];
const REGION_OPTIONS = [
  { value: '01', label: 'Region 1 – Barima-Waini' },
  { value: '02', label: 'Region 2 – Pomeroon-Supenaam' },
  { value: '03', label: 'Region 3 – Essequibo Islands-West Demerara' },
  { value: '04', label: 'Region 4 – Demerara-Mahaica' },
  { value: '05', label: 'Region 5 – Mahaica-Berbice' },
  { value: '06', label: 'Region 6 – East Berbice-Corentyne' },
  { value: '07', label: 'Region 7 – Cuyuni-Mazaruni' },
  { value: '08', label: 'Region 8 – Potaro-Siparuni' },
  { value: '09', label: 'Region 9 – Upper Takutu-Upper Essequibo' },
  { value: '10', label: 'Region 10 – Upper Demerara-Berbice' },
  { value: 'GT', label: 'Georgetown' },
  { value: 'MR', label: 'Multi-Region' },
];
const STATUS_OPTIONS = ['Not Started', 'In Progress', 'On Hold', 'Delayed', 'Complete', 'Cancelled'];
const HEALTH_OPTIONS = [
  { value: 'green', label: 'On Track', color: 'bg-emerald-500' },
  { value: 'amber', label: 'Minor Issues', color: 'bg-amber-500' },
  { value: 'red', label: 'Critical', color: 'bg-red-500' },
];

const STATUS_STYLES: Record<string, { variant: 'success' | 'danger' | 'info' | 'default' | 'warning'; label: string }> = {
  Complete: { variant: 'success', label: 'Complete' },
  Delayed: { variant: 'danger', label: 'Delayed' },
  'In Progress': { variant: 'info', label: 'In Progress' },
  'Not Started': { variant: 'default', label: 'Not Started' },
  'On Hold': { variant: 'warning', label: 'On Hold' },
  Cancelled: { variant: 'danger', label: 'Cancelled' },
};

const HEALTH_DOT: Record<string, string> = {
  green: 'bg-emerald-400', amber: 'bg-amber-400', red: 'bg-red-400',
};

// ── Formatting ─────────────────────────────────────────────────────────────

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return '-';
  if (value > 1e11) return '-';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function fmtCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '-') return 'N/A';
  const num = typeof value === 'string' ? parseFloat(value.replace(/[$,]/g, '')) : Number(value);
  if (isNaN(num) || num <= 0) return 'N/A';
  if (num > 1e11) return 'N/A';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
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
  if (code === 'GT') return 'Georgetown';
  if (code === 'MR') return 'Multi-Region';
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
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Shared UI Components ───────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    overdue: 'bg-red-500/20 text-red-400 border-red-500/30',
    delayed: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'at-risk': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'ending-soon': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'bond-warning': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] || 'bg-[#2d3a52] text-[#94a3b8]'}`}>
      {status.replace('-', ' ')}
    </span>
  );
}

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

function MultiSelect({
  label, options, selected, onChange, renderOption,
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
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  function toggle(val: string) { onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]); }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none flex items-center gap-2 min-w-[130px]">
        <span className="truncate">{selected.length ? `${label} (${selected.length})` : label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-[#64748b] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-[#1a2744] border border-[#2d3a52] rounded-lg shadow-xl z-50 min-w-[200px] max-h-[300px] overflow-y-auto">
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-2 hover:bg-[#0a1628]/60 cursor-pointer text-sm">
              <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} className="accent-[#d4af37]" />
              {renderOption ? renderOption(opt) : <span className="text-white">{opt.label}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Scraped Oversight Components ───────────────────────────────────────────

function OversightKpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl p-4">
      <p className="text-[#64748b] text-xs uppercase tracking-wider">{label}</p>
      <p className="text-white text-xl md:text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-[#64748b] text-xs mt-1">{sub}</p>}
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, count, accent, defaultOpen = false, children }: {
  title: string; icon: any; count: number; accent: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 hover:bg-[#2d3a52]/30 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${accent} flex items-center justify-center`}><Icon className="h-4 w-4" /></div>
          <span className="text-white font-medium">{title}</span>
          <span className="bg-[#2d3a52] text-[#94a3b8] text-xs px-2 py-0.5 rounded-full">{count}</span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-[#64748b]" /> : <ChevronRight className="h-4 w-4 text-[#64748b]" />}
      </button>
      {open && <div className="border-t border-[#2d3a52]">{children}</div>}
    </div>
  );
}

function ProjectRow({ project, tag }: { project: any; tag?: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-[#2d3a52]/20 transition-colors border-b border-[#2d3a52]/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{project.name || 'Unnamed'}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[#64748b]">
          <span>{project.agency}</span>
          {project.region && <span>{project.region}</span>}
          {project.contractValueDisplay && <span>{project.contractValueDisplay}</span>}
          {project.contractor && <span>{project.contractor}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {project.completion != null && (
          <div className="text-right">
            <p className="text-xs font-mono text-[#94a3b8]">{project.completion}%</p>
            <div className="w-16 h-1.5 bg-[#2d3a52] rounded-full mt-1">
              <div className="h-full rounded-full bg-[#d4af37]" style={{ width: `${Math.min(project.completion, 100)}%` }} />
            </div>
          </div>
        )}
        {tag && <StatusBadge status={tag} />}
        {project.daysOverdue != null && <span className="text-red-400 text-xs font-mono whitespace-nowrap">{project.daysOverdue}d late</span>}
        {project.daysRemaining != null && <span className="text-yellow-400 text-xs font-mono whitespace-nowrap">{project.daysRemaining}d left</span>}
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
      const res = await fetch(`/api/projects/${project.id}/escalate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
      if (!res.ok) throw new Error();
      onDone();
    } catch { alert('Failed to escalate project'); }
    setSubmitting(false);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card-premium p-6 w-full max-w-md mx-4 rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center"><ShieldAlert className="h-5 w-5 text-red-400" /></div>
          <div>
            <h2 className="text-lg font-semibold text-white">Escalate Project</h2>
            <p className="text-[#64748b] text-xs line-clamp-1">{project.project_name}</p>
          </div>
        </div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why does this project need escalation?" className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-3 text-sm text-white placeholder-[#64748b] focus:border-red-400 focus:outline-none resize-none h-28" />
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
      const res = await fetch('/api/projects/filters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filter_name: name, filter_params: filterParams }) });
      if (!res.ok) throw new Error();
      onSaved();
    } catch { alert('Failed to save filter'); }
    setSaving(false);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card-premium p-6 w-full max-w-sm mx-4 rounded-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white mb-4">Save Filter Preset</h2>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. GPL Delayed Projects" className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none" onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim() || saving} className="btn-gold px-4 py-2 text-sm disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Project Detail Slide Panel ─────────────────────────────────────────────

function ProjectSlidePanel({ project, onClose, userRole, onEscalate, onRefreshList }: {
  project: Project; onClose: () => void; userRole: string; onEscalate: (p: Project) => void; onRefreshList: () => void;
}) {
  const [summary, setSummary] = useState<ProjectSummaryData | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const canDeescalate = ['dg', 'minister', 'ps'].includes(userRole);

  useEffect(() => {
    fetch(`/api/projects/${project.id}/notes`).then(r => r.json()).then(d => setNotes(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoadingNotes(false));
    fetch(`/api/projects/${project.id}/summary`).then(r => r.json()).then(d => { if (d?.summary) setSummary(d); }).catch(() => {});
  }, [project.id]);

  async function generateSummary(force = false) {
    setLoadingSummary(true);
    try { const res = await fetch(`/api/projects/${project.id}/summary`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }) }); const d = await res.json(); if (d?.summary) setSummary(d); } catch {}
    setLoadingSummary(false);
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try { const res = await fetch(`/api/projects/${project.id}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note_text: newNote }) }); const n = await res.json(); if (n?.id) { setNotes(prev => [n, ...prev]); setNewNote(''); } } catch {}
    setAddingNote(false);
  }

  async function handleDeescalate() {
    try { const res = await fetch(`/api/projects/${project.id}/escalate`, { method: 'DELETE' }); if (res.ok) onRefreshList(); } catch {}
  }

  const ss = STATUS_STYLES[project.status] || STATUS_STYLES['Not Started'];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl bg-[#0f1d32] border-l border-[#2d3a52] shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[#0f1d32] border-b border-[#2d3a52] px-5 py-4 flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg truncate pr-4">Project Detail</h2>
          <button onClick={onClose} className="text-[#64748b] hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-6">
          {project.escalated && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
              <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-400 font-semibold text-sm">Escalated</p>
                <p className="text-red-400/80 text-xs mt-0.5">{project.escalation_reason}</p>
              </div>
              {canDeescalate && <button onClick={handleDeescalate} className="text-red-400/60 hover:text-red-400 text-xs">De-escalate</button>}
            </div>
          )}
          <div>
            <h3 className="text-white font-semibold text-base mb-1">{project.project_name || '-'}</h3>
            <p className="text-[#64748b] text-xs font-mono">{project.project_id}</p>
            <div className="flex items-center gap-3 mt-3">
              <Badge variant={ss.variant}>{ss.label}</Badge>
              <HealthDot health={project.health} />
              {project.sub_agency && <span className="text-[#d4af37] text-xs font-medium px-2 py-0.5 rounded bg-[#d4af37]/10">{project.sub_agency}</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-[#64748b] text-xs">Contract Value</span><p className="text-[#d4af37] font-semibold">{fmtCurrency(project.contract_value)}</p></div>
            <div><span className="text-[#64748b] text-xs">Completion</span><div className="mt-0.5"><ProgressBar pct={project.completion_pct} /></div></div>
            <div><span className="text-[#64748b] text-xs">Contractor</span><p className="text-white">{project.contractor || '-'}</p></div>
            <div><span className="text-[#64748b] text-xs">Region</span><p className="text-white">{fmtRegion(project.region)}</p></div>
            <div><span className="text-[#64748b] text-xs">End Date</span><p className={project.status === 'Delayed' ? 'text-red-400 font-semibold' : 'text-white'}>{fmtDate(project.project_end_date)}</p></div>
            <div>
              <span className="text-[#64748b] text-xs">Agency</span>
              <p className="text-white">{project.sub_agency || project.executing_agency || '-'}</p>
              {project.executing_agency && project.sub_agency && project.executing_agency !== project.sub_agency && <p className="text-[#4a5568] text-[10px] mt-0.5">under {project.executing_agency}</p>}
            </div>
            {project.days_overdue > 0 && <div><span className="text-[#64748b] text-xs">Days Overdue</span><p className="text-red-400 font-semibold">{project.days_overdue} days</p></div>}
          </div>
          {!project.escalated && (
            <button onClick={() => onEscalate(project)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm hover:bg-red-500/20 transition-colors w-full justify-center">
              <Flag className="h-4 w-4" /> Escalate Project
            </button>
          )}
          {/* AI Summary */}
          <div className="card-premium p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#d4af37]" /><h4 className="text-white font-semibold text-sm">AI Summary</h4></div>
              <button onClick={() => generateSummary(!!summary)} disabled={loadingSummary} className="text-[#d4af37] text-xs hover:text-[#e5c04b] flex items-center gap-1">
                {loadingSummary ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}{summary ? 'Regenerate' : 'Generate'}
              </button>
            </div>
            {loadingSummary ? (
              <div className="space-y-3 animate-pulse">{[1,2,3,4,5].map(i => <div key={i} className="h-4 bg-[#2d3a52] rounded w-full" />)}</div>
            ) : summary?.summary ? (
              <div className="space-y-3 text-sm">
                <div><span className="text-[#64748b] text-xs uppercase tracking-wider">Status Snapshot</span><p className="text-[#94a3b8] mt-0.5">{summary.summary.status_snapshot}</p></div>
                <div><span className="text-[#64748b] text-xs uppercase tracking-wider">Timeline</span><p className="text-[#94a3b8] mt-0.5">{summary.summary.timeline_assessment}</p></div>
                <div><span className="text-[#64748b] text-xs uppercase tracking-wider">Budget Position</span><p className="text-[#94a3b8] mt-0.5">{summary.summary.budget_position}</p></div>
                {summary.summary.key_risks?.length > 0 && <div><span className="text-[#64748b] text-xs uppercase tracking-wider">Key Risks</span><ul className="mt-1 space-y-1">{summary.summary.key_risks.map((r, i) => <li key={i} className="text-red-400/80 text-xs flex items-start gap-1.5"><AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />{r}</li>)}</ul></div>}
                {summary.summary.recommended_actions?.length > 0 && <div><span className="text-[#64748b] text-xs uppercase tracking-wider">Recommended Actions</span><ul className="mt-1 space-y-1">{summary.summary.recommended_actions.map((a, i) => <li key={i} className="text-emerald-400/80 text-xs flex items-start gap-1.5"><CheckCircle className="h-3 w-3 shrink-0 mt-0.5" />{a}</li>)}</ul></div>}
                <p className="text-[#4a5568] text-[10px] mt-2">Generated {summary.generated_at ? timeAgo(summary.generated_at) : ''}</p>
              </div>
            ) : <p className="text-[#64748b] text-sm">Click &quot;Generate&quot; to create an AI summary.</p>}
          </div>
          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 mb-3"><MessageSquare className="h-4 w-4 text-[#d4af37]" /><h4 className="text-white font-semibold text-sm">Activity Log</h4><span className="text-[#64748b] text-xs">({notes.length})</span></div>
            <div className="flex items-start gap-2 mb-4">
              <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..." rows={2} className="flex-1 bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none resize-none" />
              <button onClick={addNote} disabled={!newNote.trim() || addingNote} className="btn-gold p-2.5 rounded-lg disabled:opacity-40 shrink-0">{addingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
            </div>
            {loadingNotes ? <div className="space-y-3 animate-pulse">{[1,2].map(i => <div key={i} className="h-12 bg-[#2d3a52] rounded" />)}</div>
            : notes.length === 0 ? <p className="text-[#64748b] text-sm">No notes yet.</p>
            : <div className="space-y-3 max-h-[400px] overflow-y-auto">{notes.map(n => (
                <div key={n.id} className={`p-3 rounded-lg text-sm ${n.note_type === 'escalation' ? 'bg-red-500/5 border border-red-500/20' : 'bg-[#0a1628] border border-[#2d3a52]/50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-xs">{n.user_name}</span>
                      <span className="text-[#4a5568] text-[10px]">{n.user_role}</span>
                      {n.note_type === 'escalation' && <span className="text-red-400 text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10">ESCALATION</span>}
                    </div>
                    <span className="text-[#4a5568] text-[10px]">{timeAgo(n.created_at)}</span>
                  </div>
                  <p className="text-[#94a3b8] text-xs">{n.note_text}</p>
                </div>
              ))}</div>}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Timeline View ──────────────────────────────────────────────────────────

function TimelineView({ projects, groupBy }: { projects: Project[]; groupBy: 'agency' | 'region' }) {
  const groups = useMemo(() => {
    const g: Record<string, Project[]> = {};
    for (const p of projects) {
      const key = groupBy === 'agency' ? (p.sub_agency || 'Unknown') : fmtRegion(p.region);
      if (!g[key]) g[key] = [];
      g[key].push(p);
    }
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
  }, [projects, groupBy]);

  const now = new Date();
  const dates = projects.flatMap(p => {
    const d: Date[] = [];
    if (p.start_date) d.push(new Date(p.start_date));
    if (p.project_end_date) d.push(new Date(p.project_end_date));
    return d;
  }).filter(d => !isNaN(d.getTime()));

  if (dates.length === 0) return <div className="card-premium p-8 text-center text-[#64748b]">No date data available for timeline view.</div>;

  const minDate = new Date(Math.min(...dates.map(d => d.getTime()), now.getTime() - 365 * 86400000));
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime()), now.getTime() + 180 * 86400000));
  const totalDays = (maxDate.getTime() - minDate.getTime()) / 86400000;
  function getPos(ds: string | null) { if (!ds) return 0; const d = new Date(ds); return isNaN(d.getTime()) ? 0 : ((d.getTime() - minDate.getTime()) / 86400000 / totalDays) * 100; }
  const nowPos = ((now.getTime() - minDate.getTime()) / 86400000 / totalDays) * 100;
  const hc: Record<string, string> = { green: 'bg-emerald-500/80', amber: 'bg-amber-500/80', red: 'bg-red-500/80' };

  return (
    <div className="card-premium overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="flex items-center border-b border-[#2d3a52] px-4 py-2 relative">
            <div className="w-48 shrink-0 text-[#64748b] text-xs font-medium uppercase">Project</div>
            <div className="flex-1 relative h-6">
              {Array.from({ length: Math.min(Math.ceil(totalDays / 30), 36) }).map((_, i) => {
                const d = new Date(minDate.getTime() + i * 30 * 86400000);
                return <span key={i} className="absolute text-[10px] text-[#4a5568] whitespace-nowrap" style={{ left: `${(i * 30 / totalDays) * 100}%` }}>{d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}</span>;
              })}
            </div>
          </div>
          {groups.map(([name, items]) => (
            <div key={name}>
              <div className="px-4 py-2 bg-[#0a1628]/60 border-b border-[#2d3a52]/50">
                <span className="text-[#d4af37] text-xs font-semibold">{name}</span>
                <span className="text-[#64748b] text-xs ml-2">({items.length})</span>
              </div>
              {items.slice(0, 20).map(p => {
                const start = getPos(p.start_date || p.created_at);
                const end = getPos(p.project_end_date);
                const barLeft = Math.min(start, end || start);
                const barWidth = Math.max((end || start + 2) - barLeft, 1);
                return (
                  <div key={p.id} className="flex items-center px-4 py-1.5 border-b border-[#2d3a52]/20 hover:bg-[#1a2744]/30">
                    <div className="w-48 shrink-0 pr-2"><p className="text-white text-xs truncate" title={p.project_name || ''}>{p.project_name || '-'}</p></div>
                    <div className="flex-1 relative h-5">
                      <div className="absolute top-0 bottom-0 w-px bg-[#d4af37]/30" style={{ left: `${nowPos}%` }} />
                      <div className={`absolute top-1 h-3 rounded-sm ${hc[p.health] || hc.green} ${p.escalated ? 'ring-1 ring-red-400' : ''}`} style={{ left: `${barLeft}%`, width: `${barWidth}%`, minWidth: '4px' }} title={`${p.project_name} (${p.completion_pct}%)`}>
                        {barWidth > 5 && <div className="h-full bg-white/20 rounded-sm" style={{ width: `${Math.min(p.completion_pct, 100)}%` }} />}
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

// ── Portfolio KPI Card ─────────────────────────────────────────────────────

function PortfolioKpiCard({ icon: Icon, label, value, color, subtitle }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; color: 'gold' | 'red' | 'green' | 'blue' | 'grey' | 'amber'; subtitle?: string;
}) {
  const colors = {
    gold: { bg: 'bg-[#d4af37]/20', text: 'text-[#d4af37]' }, red: { bg: 'bg-red-500/20', text: 'text-red-400' },
    green: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' }, blue: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
    grey: { bg: 'bg-[#4a5568]/20', text: 'text-[#94a3b8]' }, amber: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  };
  const c = colors[color];
  return (
    <div className="card-premium p-3 md:p-5 min-w-[130px] md:min-w-0">
      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg ${c.bg} flex items-center justify-center mb-2 md:mb-3`}><Icon className={`h-4 w-4 md:h-5 md:w-5 ${c.text}`} /></div>
      <p className={`text-lg md:text-2xl font-bold ${c.text} truncate`}>{value}</p>
      <p className="text-[#64748b] text-xs mt-1">{label}</p>
      {subtitle && <p className="text-[#4a5568] text-[10px] mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ── Bulk Action Bar ────────────────────────────────────────────────────────

function BulkActionBar({ count, onUpdateStatus, onUpdateHealth, onAssignOfficer, onExport, onClear, officers }: {
  count: number; onUpdateStatus: (s: string) => void; onUpdateHealth: (h: string) => void; onAssignOfficer: (userId: string | null) => void; onExport: () => void; onClear: () => void; officers: { id: string; name: string }[];
}) {
  const [showStatus, setShowStatus] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  function closeAll() { setShowStatus(false); setShowHealth(false); setShowAssign(false); }
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-[#1a2744] border border-[#d4af37]/40 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
      <span className="text-[#d4af37] font-semibold text-sm">{count} selected</span>
      <div className="relative">
        <button onClick={() => { closeAll(); setShowStatus(!showStatus); }} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1">Status <ChevronDown className="h-3 w-3" /></button>
        {showStatus && <div className="absolute bottom-full left-0 mb-2 bg-[#1a2744] border border-[#2d3a52] rounded-lg shadow-xl min-w-[140px]">
          {[{ value: 'not_started', label: 'Not Started' }, { value: 'in_progress', label: 'In Progress' }, { value: 'on_hold', label: 'On Hold' }, { value: 'delayed', label: 'Delayed' }, { value: 'completed', label: 'Complete' }, { value: 'cancelled', label: 'Cancelled' }].map(s =>
            <button key={s.value} onClick={() => { onUpdateStatus(s.value); closeAll(); }} className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-[#0a1628]/60">{s.label}</button>
          )}
        </div>}
      </div>
      <div className="relative">
        <button onClick={() => { closeAll(); setShowHealth(!showHealth); }} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1">Health <ChevronDown className="h-3 w-3" /></button>
        {showHealth && <div className="absolute bottom-full left-0 mb-2 bg-[#1a2744] border border-[#2d3a52] rounded-lg shadow-xl min-w-[140px]">
          {HEALTH_OPTIONS.map(h => <button key={h.value} onClick={() => { onUpdateHealth(h.value); closeAll(); }} className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-white hover:bg-[#0a1628]/60"><span className={`w-2 h-2 rounded-full ${h.color}`} />{h.label}</button>)}
        </div>}
      </div>
      <div className="relative">
        <button onClick={() => { closeAll(); setShowAssign(!showAssign); }} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1"><UserPlus className="h-3 w-3" /> Assign <ChevronDown className="h-3 w-3" /></button>
        {showAssign && <div className="absolute bottom-full left-0 mb-2 bg-[#1a2744] border border-[#2d3a52] rounded-lg shadow-xl min-w-[180px] max-h-[200px] overflow-y-auto">
          <button onClick={() => { onAssignOfficer(null); closeAll(); }} className="block w-full text-left px-3 py-2 text-sm text-[#64748b] hover:bg-[#0a1628]/60 italic">Unassign</button>
          {officers.map(o => <button key={o.id} onClick={() => { onAssignOfficer(o.id); closeAll(); }} className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-[#0a1628]/60">{o.name}</button>)}
        </div>}
      </div>
      <button onClick={onExport} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1"><Download className="h-3 w-3" /> CSV</button>
      <button onClick={onClear} className="text-[#64748b] hover:text-white"><X className="h-4 w-4" /></button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function OversightPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const userRole = session?.user?.role || 'officer';

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<TabMode>(() => (searchParams.get('tab') as TabMode) || 'alerts');

  // ── Scraped oversight data ──
  const [oversightData, setOversightData] = useState<OversightData | null>(null);
  const [oversightLoading, setOversightLoading] = useState(true);
  const [oversightError, setOversightError] = useState<string | null>(null);
  const [expandedAgency, setExpandedAgency] = useState<string | null>(null);

  const projectsByAgency = useMemo(() => {
    if (!oversightData) return {};
    const map: Record<string, { project: any; tag: string }[]> = {};
    const seen = new Set<string>();
    function addProjects(arr: any[], tag: string) {
      for (const p of arr) {
        const agency = p.agency || p.subAgency || '-';
        const key = `${agency}-${p.name || p.projectName || ''}-${p.id || p.p3Id || ''}`;
        if (seen.has(key)) continue; seen.add(key);
        if (!map[agency]) map[agency] = [];
        map[agency].push({ project: p, tag });
      }
    }
    addProjects(oversightData.overdue, 'overdue');
    addProjects(oversightData.atRisk, 'at-risk');
    addProjects(oversightData.endingSoon, 'ending-soon');
    addProjects(oversightData.delayed, 'delayed');
    addProjects(oversightData.bondWarnings, 'bond-warning');
    return map;
  }, [oversightData]);

  const fetchOversight = useCallback(async () => {
    setOversightLoading(true); setOversightError(null);
    try { const res = await fetch('/api/oversight'); const json = await res.json(); if (!json.success) throw new Error(json.error); setOversightData(json.data); }
    catch (err: any) { setOversightError(err.message); }
    finally { setOversightLoading(false); }
  }, []);

  // ── PSIP project data ──
  const [psipSummary, setPsipSummary] = useState<PortfolioSummary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [psipLoading, setPsipLoading] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [contractors, setContractors] = useState<string[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [officers, setOfficers] = useState<{ id: string; name: string }[]>([]);

  // UI
  const [showFilters, setShowFilters] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [escalateTarget, setEscalateTarget] = useState<Project | null>(null);
  const [showSaveFilter, setShowSaveFilter] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [timelineGroupBy, setTimelineGroupBy] = useState<'agency' | 'region'>('agency');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filters
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

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    p.set('tab', activeTab);
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
  }, [activeTab, agencies, statuses, regions, healths, budgetMin, budgetMax, contractor, dateField, dateFrom, dateTo, search, sort, page]);

  // Sync URL
  useEffect(() => {
    const str = buildParams().toString();
    if (str !== searchParams.toString()) router.replace(`/oversight?${str}`, { scroll: false });
  }, [buildParams]);

  // Fetch PSIP summary
  const fetchPsipSummary = useCallback(async () => {
    try {
      const params = buildParams(); params.delete('page'); params.delete('sort'); params.delete('tab');
      const res = await fetch(`/api/projects/summary?${params}`);
      const d = await res.json();
      if (d.total_projects !== undefined) setPsipSummary(d);
    } catch {}
  }, [buildParams]);

  // Fetch PSIP projects
  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const params = buildParams(); params.set('page', String(page)); params.set('limit', String(limit)); params.delete('tab');
      const res = await fetch(`/api/projects/list?${params}`);
      const d = await res.json();
      setProjects(d.projects || []); setTotalCount(d.total || 0);
    } catch {}
    setLoadingProjects(false);
  }, [buildParams, page]);

  // Initial load
  useEffect(() => {
    fetchOversight();
    setPsipLoading(true);
    Promise.all([fetchPsipSummary(), fetchProjects()]).finally(() => setPsipLoading(false));
    fetch('/api/projects/contractors').then(r => r.json()).then(d => { if (Array.isArray(d)) setContractors(d); }).catch(() => {});
    fetch('/api/projects/filters').then(r => r.json()).then(d => { if (Array.isArray(d)) setSavedFilters(d); }).catch(() => {});
    fetch('/api/admin/users').then(r => r.ok ? r.json() : null).then(d => { const users = d?.users; if (Array.isArray(users)) setOfficers(users.filter((u: any) => u.is_active).map((u: any) => ({ id: u.id, name: u.name || u.email }))); }).catch(() => {});
  }, []);

  useEffect(() => { if (activeTab === 'projects') fetchProjects(); }, [fetchProjects, activeTab]);
  useEffect(() => { if (activeTab === 'projects') fetchPsipSummary(); }, [agencies, statuses, regions, healths, budgetMin, budgetMax, contractor, search, activeTab]);
  useEffect(() => { setPage(1); }, [agencies, statuses, regions, healths, budgetMin, budgetMax, contractor, dateField, dateFrom, dateTo, search, sort]);

  function clearFilters() {
    setAgencies([]); setStatuses([]); setRegions([]); setHealths([]);
    setBudgetMin(''); setBudgetMax(''); setContractor('');
    setDateField('project_end_date'); setDateFrom(''); setDateTo('');
    setSearch(''); setSort('value');
  }

  function handleRefresh() {
    fetchOversight();
    setPsipLoading(true);
    // Recalculate health for all projects, then refresh data
    fetch('/api/projects/recalculate-health', { method: 'POST' })
      .catch(() => {}) // non-blocking — recalc writes to DB for filter accuracy
      .finally(() => {
        Promise.all([fetchPsipSummary(), fetchProjects()]).finally(() => setPsipLoading(false));
      });
  }

  const hasActiveFilters = agencies.length || statuses.length || regions.length || healths.length || budgetMin || budgetMax || contractor || dateFrom || dateTo || search;
  const activeFilterCount = [agencies.length > 0, statuses.length > 0, regions.length > 0, healths.length > 0, budgetMin || budgetMax, contractor, dateFrom || dateTo, search].filter(Boolean).length;
  const totalPages = Math.ceil(totalCount / limit);

  function toggleSelect(id: string) { setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleSelectAll() { setSelectedIds(selectedIds.size === projects.length ? new Set() : new Set(projects.map(p => p.id))); }

  async function handleBulkUpdate(updates: Record<string, any>) {
    try {
      const res = await fetch('/api/projects/bulk', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_ids: Array.from(selectedIds), ...updates }) });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Update failed'); return; }
      setSelectedIds(new Set()); handleRefresh();
    } catch { alert('Update failed'); }
  }

  async function handleExport() {
    try {
      const res = await fetch('/api/projects/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_ids: Array.from(selectedIds) }) });
      if (!res.ok) { alert('Export failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `projects-export-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch { alert('Export failed'); }
  }

  function applySavedFilter(sf: SavedFilter) {
    const fp = sf.filter_params;
    if (fp.agencies) setAgencies(fp.agencies); if (fp.statuses) setStatuses(fp.statuses);
    if (fp.regions) setRegions(fp.regions); if (fp.healths) setHealths(fp.healths);
    if (fp.budgetMin) setBudgetMin(fp.budgetMin); if (fp.budgetMax) setBudgetMax(fp.budgetMax);
    if (fp.contractor) setContractor(fp.contractor); if (fp.search) setSearch(fp.search);
    if (fp.sort) setSort(fp.sort);
  }

  async function deleteSavedFilter(id: string) {
    try { await fetch('/api/projects/filters', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); setSavedFilters(prev => prev.filter(f => f.id !== id)); } catch {}
  }

  const currentFilterParams = useMemo(() => {
    const fp: Record<string, any> = {};
    if (agencies.length) fp.agencies = agencies; if (statuses.length) fp.statuses = statuses;
    if (regions.length) fp.regions = regions; if (healths.length) fp.healths = healths;
    if (budgetMin) fp.budgetMin = budgetMin; if (budgetMax) fp.budgetMax = budgetMax;
    if (contractor) fp.contractor = contractor; if (search) fp.search = search;
    if (sort !== 'value') fp.sort = sort;
    return fp;
  }, [agencies, statuses, regions, healths, budgetMin, budgetMax, contractor, search, sort]);

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* Modals */}
      {escalateTarget && <EscalationModal project={escalateTarget} onClose={() => setEscalateTarget(null)} onDone={() => { setEscalateTarget(null); handleRefresh(); }} />}
      {showSaveFilter && <SaveFilterModal filterParams={currentFilterParams} onClose={() => setShowSaveFilter(false)} onSaved={() => { setShowSaveFilter(false); fetch('/api/projects/filters').then(r => r.json()).then(d => { if (Array.isArray(d)) setSavedFilters(d); }); }} />}
      {selectedProject && <ProjectSlidePanel project={selectedProject} onClose={() => setSelectedProject(null)} userRole={userRole} onEscalate={p => { setSelectedProject(null); setEscalateTarget(p); }} onRefreshList={() => { setSelectedProject(null); handleRefresh(); }} />}

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center shrink-0">
            <Eye className="h-4 w-4 md:h-5 md:w-5 text-[#d4af37]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-white">Oversight Dashboard</h1>
            <p className="text-[#64748b] text-xs md:text-sm truncate">Project monitoring &amp; intelligence</p>
          </div>
        </div>
        <button onClick={handleRefresh} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] hover:text-white transition-colors shrink-0">
          <RefreshCw className={`h-4 w-4 ${oversightLoading ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline text-sm">Refresh</span>
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 bg-[#1a2744] border border-[#2d3a52] rounded-xl p-1">
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'alerts' ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}
        >
          <AlertTriangle className="h-4 w-4 inline mr-2" />Alerts &amp; Flags
          {oversightData && <span className="ml-2 bg-[#2d3a52] text-[#94a3b8] text-xs px-1.5 py-0.5 rounded-full">{oversightData.summary.overdue + oversightData.summary.atRisk + oversightData.summary.delayed}</span>}
        </button>
        <button
          onClick={() => setActiveTab('projects')}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'projects' ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}
        >
          <Building2 className="h-4 w-4 inline mr-2" />Projects &amp; Filters
          {psipSummary && <span className="ml-2 bg-[#2d3a52] text-[#94a3b8] text-xs px-1.5 py-0.5 rounded-full">{psipSummary.total_projects}</span>}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: ALERTS & FLAGS (existing scraped oversight data) */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'alerts' && (
        <>
          {oversightLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[...Array(6)].map((_, i) => <div key={i} className="bg-[#1a2744] border border-[#2d3a52] rounded-xl p-4 animate-pulse"><div className="h-3 w-16 bg-[#2d3a52] rounded mb-2" /><div className="h-7 w-20 bg-[#2d3a52] rounded" /></div>)}
            </div>
          ) : oversightError ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
              <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
              <p className="text-red-400 font-medium">{oversightError}</p>
              <p className="text-[#64748b] text-sm mt-1">Run <code className="bg-[#2d3a52] px-2 py-0.5 rounded text-xs">cd scraper && node scraper.js --highlights</code> to generate data.</p>
            </div>
          ) : oversightData ? (
            <>
              {/* Scraped KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <OversightKpiCard label="Contract Cost" value={oversightData.dashboard.kpis.totalContractCostDisplay || formatCurrency(oversightData.dashboard.kpis.totalContractCost ?? null)} />
                <OversightKpiCard label="Disbursement" value={oversightData.dashboard.kpis.totalDisbursementDisplay || formatCurrency(oversightData.dashboard.kpis.totalDisbursement ?? null)} />
                <OversightKpiCard label="Balance" value={oversightData.dashboard.kpis.totalBalanceDisplay || formatCurrency(oversightData.dashboard.kpis.totalBalance ?? null)} />
                <OversightKpiCard label="Projects" value={String(oversightData.dashboard.kpis.totalProjects ?? oversightData.metadata.totalProjects)} />
                <OversightKpiCard label="Utilization" value={oversightData.dashboard.kpis.utilizationPercent != null ? `${oversightData.dashboard.kpis.utilizationPercent}%` : '-'} />
                <OversightKpiCard label="Engineer Est." value={oversightData.dashboard.kpis.engineerEstimateDisplay || formatCurrency(oversightData.dashboard.kpis.engineerEstimate ?? null)} />
              </div>

              {/* Status Chart */}
              {oversightData.dashboard.statusChart && Object.keys(oversightData.dashboard.statusChart).length > 0 && (
                <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl p-4">
                  <p className="text-[#64748b] text-xs uppercase tracking-wider mb-3">Project Status</p>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(oversightData.dashboard.statusChart).map(([label, value]) => {
                      const pct = typeof value === 'object' && value ? value.percent : typeof value === 'number' ? value : null;
                      const count = typeof value === 'object' && value ? value.count : null;
                      const colors: Record<string, string> = { Designed: 'bg-blue-500', Commenced: 'bg-emerald-500', Delayed: 'bg-orange-500', Completed: 'bg-green-500', Rollover: 'bg-purple-500', Cancelled: 'bg-red-500', 'N/A': 'bg-gray-500' };
                      return (<div key={label} className="flex items-center gap-2"><div className={`w-2.5 h-2.5 rounded-full ${colors[label] || 'bg-gray-500'}`} /><span className="text-white text-sm">{label}</span>{count != null && <span className="text-[#64748b] text-xs">({count})</span>}{pct != null && <span className="text-[#64748b] text-xs">{pct}%</span>}</div>);
                    })}
                  </div>
                </div>
              )}

              {/* Alert Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: 'Overdue', count: oversightData.summary.overdue, color: 'text-red-400', bg: 'bg-red-500/10' },
                  { label: 'At Risk', count: oversightData.summary.atRisk, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                  { label: 'Ending Soon', count: oversightData.summary.endingSoon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                  { label: 'Delayed', count: oversightData.summary.delayed, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                  { label: 'Bond Warnings', count: oversightData.summary.bondWarnings, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                ].map(item => (
                  <div key={item.label} className={`${item.bg} border border-[#2d3a52] rounded-xl p-3 text-center`}>
                    <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
                    <p className="text-[#64748b] text-xs mt-1">{item.label}</p>
                  </div>
                ))}
              </div>

              {/* Collapsible Alert Sections */}
              {oversightData.overdue.length > 0 && <CollapsibleSection title="Overdue Projects" icon={AlertTriangle} count={oversightData.overdue.length} accent="bg-red-500/20 text-red-400" defaultOpen>{oversightData.overdue.sort((a: any, b: any) => (b.daysOverdue || 0) - (a.daysOverdue || 0)).map((p: any, i: number) => <ProjectRow key={p.p3Id || i} project={p} tag="overdue" />)}</CollapsibleSection>}
              {oversightData.atRisk.length > 0 && <CollapsibleSection title="At-Risk Projects" icon={ShieldAlert} count={oversightData.atRisk.length} accent="bg-yellow-500/20 text-yellow-400">{oversightData.atRisk.sort((a: any, b: any) => (a.daysRemaining || 0) - (b.daysRemaining || 0)).map((p: any, i: number) => <ProjectRow key={p.p3Id || i} project={p} tag="at-risk" />)}</CollapsibleSection>}
              {oversightData.endingSoon.length > 0 && <CollapsibleSection title="Ending Soon" icon={Clock} count={oversightData.endingSoon.length} accent="bg-blue-500/20 text-blue-400">{oversightData.endingSoon.sort((a: any, b: any) => (a.daysRemaining || 0) - (b.daysRemaining || 0)).map((p: any, i: number) => <ProjectRow key={p.p3Id || i} project={p} tag="ending-soon" />)}</CollapsibleSection>}
              {oversightData.bondWarnings.length > 0 && <CollapsibleSection title="Bond Warnings" icon={FileWarning} count={oversightData.bondWarnings.length} accent="bg-purple-500/20 text-purple-400">{oversightData.bondWarnings.map((p: any, i: number) => <ProjectRow key={p.p3Id || i} project={p} tag="bond-warning" />)}</CollapsibleSection>}

              {/* Agency Breakdown */}
              <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b border-[#2d3a52]"><div className="w-8 h-8 rounded-lg bg-[#d4af37]/20 flex items-center justify-center"><Building2 className="h-4 w-4 text-[#d4af37]" /></div><span className="text-white font-medium">Agency Breakdown</span></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-[#64748b] text-xs uppercase tracking-wider"><th className="text-left px-4 py-3 w-6"></th><th className="text-left px-4 py-3">Agency</th><th className="text-right px-4 py-3">Projects</th><th className="text-right px-4 py-3">Total Value</th><th className="text-right px-4 py-3">Avg Completion</th></tr></thead>
                    <tbody>
                      {oversightData.agencyBreakdown.map(a => {
                        const isExp = expandedAgency === a.agency;
                        const agencyProjects = projectsByAgency[a.agency] || [];
                        return (
                          <Fragment key={a.agency}>
                            <tr onClick={() => setExpandedAgency(isExp ? null : a.agency)} className={`border-t border-[#2d3a52]/50 hover:bg-[#2d3a52]/20 cursor-pointer transition-colors ${isExp ? 'bg-[#2d3a52]/30' : ''}`}>
                              <td className="pl-4 py-3 w-6"><ChevronRight className={`h-3.5 w-3.5 text-[#64748b] transition-transform duration-200 ${isExp ? 'rotate-90' : ''}`} /></td>
                              <td className="px-4 py-3"><span className="text-white font-medium">{a.agency || '-'}</span>{a.agencyFull && a.agencyFull !== a.agency && <span className="text-[#64748b] text-xs ml-2 hidden md:inline">{a.agencyFull}</span>}</td>
                              <td className="px-4 py-3 text-[#94a3b8] text-right">{a.projectCount}</td>
                              <td className="px-4 py-3 text-[#d4af37] text-right font-mono">{a.totalValueDisplay || formatCurrency(a.totalValue)}</td>
                              <td className="px-4 py-3 text-right">{a.avgCompletion != null ? <div className="flex items-center justify-end gap-2"><div className="w-16 h-1.5 bg-[#2d3a52] rounded-full"><div className="h-full rounded-full bg-[#d4af37]" style={{ width: `${a.avgCompletion}%` }} /></div><span className="text-[#94a3b8] font-mono text-xs">{a.avgCompletion}%</span></div> : <span className="text-[#64748b]">-</span>}</td>
                            </tr>
                            {isExp && <tr><td colSpan={5} className="p-0"><div className="bg-[#0a1628]/60 border-t border-[#2d3a52]/50">{agencyProjects.length > 0 ? <div className="max-h-[400px] overflow-y-auto">{agencyProjects.map((item, i) => <ProjectRow key={item.project.id || item.project.p3Id || i} project={item.project} tag={item.tag} />)}</div> : <p className="px-4 py-6 text-[#64748b] text-sm text-center">No flagged projects for this agency</p>}</div></td></tr>}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top 10 */}
              <CollapsibleSection title="Top 10 by Contract Value" icon={TrendingUp} count={oversightData.top10.length} accent="bg-[#d4af37]/20 text-[#d4af37]">
                {oversightData.top10.map((p: any, i: number) => (
                  <div key={p.id || i} className="flex items-center gap-3 px-4 py-3 border-b border-[#2d3a52]/50 last:border-0 hover:bg-[#2d3a52]/20">
                    <span className="text-[#d4af37] font-mono text-sm w-6 text-right shrink-0">#{p.rank || i + 1}</span>
                    <div className="flex-1 min-w-0"><p className="text-white text-sm font-medium truncate">{p.name}</p><p className="text-[#64748b] text-xs">{p.agency} &middot; {p.contractValueDisplay || formatCurrency(p.contractValue)}</p></div>
                    {p.completion != null && <span className="text-[#94a3b8] font-mono text-xs shrink-0">{p.completion}%</span>}
                  </div>
                ))}
              </CollapsibleSection>
            </>
          ) : null}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: PROJECTS & FILTERS (PSIP data from Supabase) */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'projects' && (
        <>
          {/* Portfolio Dashboard Cards */}
          {psipSummary && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
              <PortfolioKpiCard icon={Building2} label="Active Projects" value={String(psipSummary.total_projects)} color="gold" />
              <PortfolioKpiCard icon={DollarSign} label="Portfolio Value" value={fmtCurrency(psipSummary.total_value)} color="gold" />
              <PortfolioKpiCard icon={AlertTriangle} label="At Risk" value={String(psipSummary.at_risk)} color="amber" subtitle="Amber + Red health" />
              <PortfolioKpiCard icon={CheckCircle} label="Completion Rate" value={psipSummary.total_projects > 0 ? `${Math.round((psipSummary.complete / psipSummary.total_projects) * 100)}%` : '0%'} color="green" subtitle={`${psipSummary.complete} of ${psipSummary.total_projects}`} />
              <PortfolioKpiCard icon={AlertTriangle} label="Delayed" value={String(psipSummary.delayed)} color="red" subtitle={psipSummary.delayed_value > 0 ? fmtCurrency(psipSummary.delayed_value) : undefined} />
            </div>
          )}

          {/* Regional Spread */}
          {psipSummary && Object.keys(psipSummary.regions).length > 1 && (
            <div className="card-premium p-4">
              <h3 className="text-white text-sm font-semibold mb-3">Regional Spread</h3>
              <div className="flex items-end gap-1 h-16">
                {Object.entries(psipSummary.regions).filter(([k]) => k !== 'Unknown').sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([reg, count]) => {
                  const maxCount = Math.max(...Object.values(psipSummary.regions));
                  const h = Math.max((count / maxCount) * 100, 8);
                  return (<div key={reg} className="flex-1 flex flex-col items-center gap-1"><span className="text-[#d4af37] text-[10px] font-medium">{count}</span><div className="w-full bg-[#d4af37]/30 rounded-t" style={{ height: `${h}%` }} /><span className="text-[#64748b] text-[9px]">R{parseInt(reg)}</span></div>);
                })}
              </div>
            </div>
          )}

          {/* Filter Panel */}
          <div className="card-premium">
            <button onClick={() => setShowFilters(!showFilters)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#1a2744]/40 transition-colors">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-[#d4af37]" />
                <span className="text-white text-sm font-medium">Filters</span>
                {activeFilterCount > 0 && <span className="bg-[#d4af37] text-[#0a1628] text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{activeFilterCount}</span>}
              </div>
              <ChevronDown className={`h-4 w-4 text-[#64748b] transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
            {showFilters && (
              <div className="px-4 pb-4 space-y-3 border-t border-[#2d3a52]">
                <div className="pt-3 flex flex-wrap items-end gap-3">
                  <MultiSelect label="Agency" options={AGENCY_OPTIONS.map(a => ({ value: a, label: a }))} selected={agencies} onChange={setAgencies} />
                  <MultiSelect label="Status" options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))} selected={statuses} onChange={setStatuses} />
                  <MultiSelect label="Region" options={REGION_OPTIONS} selected={regions} onChange={setRegions} />
                  <MultiSelect label="Health" options={HEALTH_OPTIONS.map(h => ({ value: h.value, label: h.label }))} selected={healths} onChange={setHealths} renderOption={opt => <span className="flex items-center gap-2 text-white"><span className={`w-2 h-2 rounded-full ${HEALTH_DOT[opt.value] || ''}`} />{opt.label}</span>} />
                  <div className="flex items-center gap-1">
                    <input type="number" placeholder="Min $" value={budgetMin} onChange={e => setBudgetMin(e.target.value)} className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-2 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none w-24" />
                    <span className="text-[#64748b] text-xs">-</span>
                    <input type="number" placeholder="Max $" value={budgetMax} onChange={e => setBudgetMax(e.target.value)} className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-2 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none w-24" />
                  </div>
                  <input type="text" list="contractor-list" value={contractor} onChange={e => setContractor(e.target.value)} placeholder="Contractor..." className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none w-40" />
                  <datalist id="contractor-list">{contractors.slice(0, 50).map(c => <option key={c} value={c} />)}</datalist>
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
                    <input type="text" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select value={dateField} onChange={e => setDateField(e.target.value)} className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none"><option value="project_end_date">End Date</option><option value="start_date">Start Date</option><option value="updated_at">Last Updated</option></select>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none" />
                  <span className="text-[#64748b] text-xs">to</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none" />
                  <select value={sort} onChange={e => setSort(e.target.value)} className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none"><option value="value">Sort: Value</option><option value="completion">Sort: Completion %</option><option value="end_date">Sort: End Date</option><option value="agency">Sort: Agency</option><option value="name">Sort: Name</option><option value="health">Sort: Health</option></select>
                  <div className="flex-1" />
                  {hasActiveFilters && (
                    <>
                      <button onClick={() => setShowSaveFilter(true)} className="text-[#d4af37] text-xs flex items-center gap-1 hover:text-[#e5c04b]"><BookmarkPlus className="h-3.5 w-3.5" /> Save Preset</button>
                      <button onClick={clearFilters} className="text-[#64748b] hover:text-white text-xs flex items-center gap-1"><X className="h-3.5 w-3.5" /> Clear All</button>
                    </>
                  )}
                </div>
                {savedFilters.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Bookmark className="h-3.5 w-3.5 text-[#64748b]" />
                    {savedFilters.map(sf => (
                      <div key={sf.id} className="flex items-center gap-1 bg-[#0a1628] border border-[#2d3a52] rounded-lg px-2 py-1">
                        <button onClick={() => applySavedFilter(sf)} className="text-[#d4af37] text-xs hover:text-[#e5c04b]">{sf.filter_name}</button>
                        <button onClick={() => deleteSavedFilter(sf.id)} className="text-[#4a5568] hover:text-red-400"><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Project count + View Toggle */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {hasActiveFilters ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#d4af37]/10 border border-[#d4af37]/30 text-sm">
                  <Filter className="h-3.5 w-3.5 text-[#d4af37]" />
                  <span className="text-[#d4af37]">Showing {psipSummary?.total_projects || totalCount} projects</span>
                  <button onClick={clearFilters} className="ml-1 text-[#d4af37]/60 hover:text-[#d4af37]"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : psipSummary && <span className="text-[#64748b] text-sm">{psipSummary.total_projects} projects</span>}
            </div>
            <div className="flex items-center gap-1 bg-[#0a1628] border border-[#2d3a52] rounded-lg p-0.5">
              <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}><List className="h-3.5 w-3.5 inline mr-1" />List</button>
              <button onClick={() => setViewMode('timeline')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'timeline' ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}><GanttChart className="h-3.5 w-3.5 inline mr-1" />Timeline</button>
              {viewMode === 'timeline' && <select value={timelineGroupBy} onChange={e => setTimelineGroupBy(e.target.value as 'agency' | 'region')} className="bg-transparent text-xs text-[#94a3b8] ml-2 focus:outline-none"><option value="agency">By Agency</option><option value="region">By Region</option></select>}
            </div>
          </div>

          {/* Project View */}
          {viewMode === 'timeline' ? <TimelineView projects={projects} groupBy={timelineGroupBy} /> : (
            <>
              <div className="card-premium overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2d3a52] text-[#64748b] text-xs uppercase">
                        <th className="px-3 py-3 text-center font-medium w-10"><button onClick={toggleSelectAll} className="text-[#64748b] hover:text-white">{selectedIds.size === projects.length && projects.length > 0 ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}</button></th>
                        <th className="px-3 py-3 text-left font-medium">Status</th>
                        <th className="px-3 py-3 text-left font-medium">Health</th>
                        <th className="px-4 py-3 text-left font-medium">Project Name</th>
                        <th className="px-3 py-3 text-left font-medium">Agency</th>
                        <th className="px-3 py-3 text-left font-medium">Region</th>
                        <th className="px-3 py-3 text-right font-medium">Value</th>
                        <th className="px-3 py-3 text-left font-medium">End Date</th>
                        <th className="px-3 py-3 text-left font-medium">Completion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2d3a52]/50">
                      {loadingProjects ? Array.from({ length: 8 }).map((_, i) => <tr key={i} className="animate-pulse">{Array.from({ length: 9 }).map((_, j) => <td key={j} className="px-3 py-3"><div className="h-5 bg-[#2d3a52] rounded w-full" /></td>)}</tr>)
                      : projects.length === 0 ? <tr><td colSpan={9} className="px-4 py-12 text-center text-[#64748b]">No projects match your filters.</td></tr>
                      : projects.map(p => {
                          const ss = STATUS_STYLES[p.status] || STATUS_STYLES['Not Started'];
                          const isSelected = selectedIds.has(p.id);
                          return (
                            <tr key={p.id} className={`hover:bg-[#1a2744]/40 cursor-pointer transition-colors ${p.escalated ? 'bg-red-500/5 border-l-2 border-l-red-500' : ''} ${isSelected ? 'bg-[#d4af37]/5' : ''}`}>
                              <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}><button onClick={() => toggleSelect(p.id)} className="text-[#64748b] hover:text-white">{isSelected ? <CheckSquare className="h-4 w-4 text-[#d4af37]" /> : <Square className="h-4 w-4" />}</button></td>
                              <td className="px-3 py-3" onClick={() => setSelectedProject(p)}><div className="flex items-center gap-1.5"><Badge variant={ss.variant}>{ss.label}</Badge>{p.escalated && <ShieldAlert className="h-3.5 w-3.5 text-red-400" />}</div></td>
                              <td className="px-3 py-3" onClick={() => setSelectedProject(p)}><HealthDot health={p.health} /></td>
                              <td className="px-4 py-3" onClick={() => setSelectedProject(p)}><span className="text-white line-clamp-2 max-w-[350px]" title={p.project_name || ''}>{p.project_name || '-'}</span></td>
                              <td className="px-3 py-3" onClick={() => setSelectedProject(p)}><span className="text-[#d4af37] font-medium text-xs">{p.sub_agency || '-'}</span></td>
                              <td className="px-3 py-3 text-[#94a3b8]" onClick={() => setSelectedProject(p)}>{fmtRegion(p.region)}</td>
                              <td className="px-3 py-3 text-right" onClick={() => setSelectedProject(p)}><span className="text-[#d4af37] font-mono text-xs">{fmtCurrency(p.contract_value)}</span></td>
                              <td className="px-3 py-3" onClick={() => setSelectedProject(p)}><span className={p.status === 'Delayed' ? 'text-red-400 font-semibold' : 'text-[#94a3b8]'}>{fmtDate(p.project_end_date)}</span></td>
                              <td className="px-3 py-3" onClick={() => setSelectedProject(p)}><ProgressBar pct={p.completion_pct} /></td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between px-2 md:px-4 py-3 gap-2">
                  <span className="text-[#64748b] text-xs md:text-sm">{(page - 1) * limit + 1}-{Math.min(page * limit, totalCount)} of {totalCount}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-navy px-3 py-1.5 text-sm disabled:opacity-30">Prev</button>
                    <span className="text-[#94a3b8] text-xs md:text-sm">{page}/{totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-navy px-3 py-1.5 text-sm disabled:opacity-30">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && <BulkActionBar count={selectedIds.size} onUpdateStatus={s => handleBulkUpdate({ status_override: s })} onUpdateHealth={h => handleBulkUpdate({ health: h })} onAssignOfficer={userId => handleBulkUpdate({ assigned_to: userId })} onExport={handleExport} onClear={() => setSelectedIds(new Set())} officers={officers} />}
    </div>
  );
}
