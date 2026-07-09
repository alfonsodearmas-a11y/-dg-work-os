'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarX, CheckCircle2, Clock, Inbox, Radio, Search, Upload } from 'lucide-react';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
import { fmtGuyanaDateTime } from '@/lib/format';
import type {
  BacklogFilter,
  OutreachCaseRow,
  OutreachSortField,
  OutreachSummary,
  OutreachUploadSummary,
} from '@/lib/direct-outreach/types';
import { OUTREACH_STATUSES, OUTREACH_THEMES } from '@/lib/direct-outreach/types';
import { OutreachStatCard } from './OutreachStatCard';
import { AgencyScorecards } from './AgencyScorecards';
import { CasesTable } from './CasesTable';
import { CaseDetailPanel } from './CaseDetailPanel';

const BACKLOG_PILLS: { value: BacklogFilter; label: string }[] = [
  { value: 'all', label: 'All open' },
  { value: 'stalled60', label: 'Stalled >60d' },
  { value: 'stalled90', label: 'Stalled >90d' },
  { value: 'target', label: 'Has target date' },
  { value: 'overdue', label: 'Overdue' },
];

// Resolved is synced but excluded from the open backlog list.
const LIST_STATUSES = OUTREACH_STATUSES.filter((s) => s !== 'Resolved');

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? 'bg-gold-500/15 text-gold-500 border-gold-500/30'
          : 'bg-navy-900/60 text-slate-400 border-navy-800 hover:border-gold-500/40 hover:text-gold-500'
      }`}
    >
      {label}
    </button>
  );
}

export function DirectOutreachDashboard() {
  const { effectiveUser } = useEffectiveUser();
  const isSuperadmin = effectiveUser.role === 'superadmin';

  const [summary, setSummary] = useState<OutreachSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [cases, setCases] = useState<OutreachCaseRow[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [casesTruncated, setCasesTruncated] = useState(false);
  const [casesError, setCasesError] = useState<string | null>(null);

  const [backlog, setBacklog] = useState<BacklogFilter>('all');
  const [status, setStatus] = useState('');
  const [theme, setTheme] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<OutreachSortField>('days_idle');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [selectedCase, setSelectedCase] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSummary, setUploadSummary] = useState<OutreachUploadSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounced search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/direct-outreach');
      if (!res.ok) throw new Error('Failed to load summary');
      setSummary(await res.json());
      setSummaryError(null);
    } catch {
      setSummaryError('Failed to load the Direct Outreach summary');
    }
  }, []);

  // Guards against out-of-order responses when filters change in quick succession.
  const casesRequestSeq = useRef(0);

  const loadCases = useCallback(async () => {
    const seq = ++casesRequestSeq.current;
    setCasesLoading(true);
    const params = new URLSearchParams({ view: 'list', sort, sort_dir: sortDir });
    if (backlog !== 'all') params.set('backlog', backlog);
    if (status) params.set('status', status);
    if (theme) params.set('theme', theme);
    if (debouncedSearch) params.set('search', debouncedSearch);
    try {
      const res = await fetch(`/api/direct-outreach?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load cases');
      const data = await res.json();
      if (seq !== casesRequestSeq.current) return;
      setCases(data.cases || []);
      setCasesTruncated(Boolean(data.truncated));
      setCasesError(null);
    } catch {
      if (seq !== casesRequestSeq.current) return;
      setCasesError('Failed to load Direct Outreach cases');
    } finally {
      if (seq === casesRequestSeq.current) setCasesLoading(false);
    }
  }, [backlog, status, theme, debouncedSearch, sort, sortDir]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const handleSort = (field: OutreachSortField) => {
    if (field === sort) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setSortDir(field === 'case_id' || field === 'agency' || field === 'status' || field === 'theme' ? 'asc' : 'desc');
    }
  };

  const handleUpload = async (file: File) => {
    // Pre-check so an oversized workbook fails instantly instead of uploading
    // fully (or dying as an opaque platform 413 above ~4.5 MB on Vercel).
    if (file.size > 4 * 1024 * 1024) {
      setUploadSummary(null);
      setUploadError('Workbook exceeds the 4 MB upload limit');
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadSummary(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/direct-outreach/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        // Error bodies may not be JSON (e.g. a platform 413 or gateway page).
        const message = await res
          .json()
          .then((body) => body?.error as string | undefined)
          .catch(() => undefined);
        if (res.status === 413) throw new Error(message || 'Workbook exceeds the 4 MB upload limit');
        throw new Error(message || `Upload failed (${res.status})`);
      }
      // An ok non-JSON body means the session expired and the POST was
      // redirected to the login page — don't surface a raw JSON parse error.
      const body = await res.json().catch(() => null);
      if (!body) throw new Error('Session expired — sign in again and retry the upload');
      setUploadSummary(body);
      await Promise.all([loadSummary(), loadCases()]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const totals = summary?.totals;
  const resolutionRate = totals?.resolution_rate;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Radio className="h-8 w-8 text-gold-500" aria-hidden="true" />
            Direct Outreach
          </h1>
          <p className="text-navy-600 mt-1">
            Works visibility over the Presidential Direct Outreach case load
            {summary?.last_synced_at
              ? ` · last uploaded ${fmtGuyanaDateTime(summary.last_synced_at)}`
              : ' · not yet uploaded'}
          </p>
          {/* aria-live: announce async upload outcomes to screen readers */}
          <div role="status" aria-live="polite">
            {uploadError && <p className="text-red-400 text-sm mt-2">{uploadError}</p>}
            {uploadSummary && (
              <p className="text-emerald-400 text-sm mt-2">
                Imported {uploadSummary.cases} case{uploadSummary.cases === 1 ? '' : 's'} ·{' '}
                {uploadSummary.updates} comment{uploadSummary.updates === 1 ? '' : 's'}{' '}
                ({uploadSummary.open} open / {uploadSummary.resolved} resolved)
              </p>
            )}
          </div>
        </div>
        {isSuperadmin && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ''; // allow re-selecting the same file
                if (file) handleUpload(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn-gold flex items-center gap-2 shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {uploading ? 'Uploading…' : 'Upload OP Direct workbook'}
            </button>
          </>
        )}
      </div>

      {(summaryError || casesError) && (
        <div className="card-premium p-4 border border-red-500/30">
          <p className="text-red-400 text-sm">{summaryError || casesError}</p>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <OutreachStatCard
          label="Open Backlog"
          value={totals?.open ?? '—'}
          icon={Inbox}
          iconBg="rgba(212,175,55,0.15)"
          iconColor="#f4d03f"
          active={backlog === 'all'}
          onClick={() => setBacklog('all')}
        />
        <OutreachStatCard
          label="Stalled >90d"
          value={totals?.stalled_90 ?? '—'}
          icon={Clock}
          iconBg="rgba(220,38,38,0.15)"
          iconColor="#f87171"
          active={backlog === 'stalled90'}
          onClick={() => setBacklog('stalled90')}
        />
        <OutreachStatCard
          label="Overdue Commitments"
          value={totals?.overdue_commitments ?? '—'}
          icon={CalendarX}
          iconBg="rgba(220,38,38,0.15)"
          iconColor="#f87171"
          active={backlog === 'overdue'}
          onClick={() => setBacklog('overdue')}
        />
        <OutreachStatCard
          label="Resolution Rate"
          value={resolutionRate == null ? '—' : `${resolutionRate}%`}
          icon={CheckCircle2}
          iconBg="rgba(5,150,105,0.15)"
          iconColor="#34d399"
          sub={totals ? `${totals.resolved} of ${totals.total} cases resolved` : undefined}
        />
      </div>

      {/* Agency scorecards */}
      {summary && <AgencyScorecards agencies={summary.agencies} />}

      {/* Controls */}
      <div className="card-premium p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {BACKLOG_PILLS.map((pill) => (
            <FilterPill
              key={pill.value}
              label={pill.label}
              active={backlog === pill.value}
              onClick={() => setBacklog(pill.value)}
            />
          ))}
        </div>
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-600"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search case #, client, location, issue…"
              className="input-premium w-full !pl-9 text-sm"
              aria-label="Search cases"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="input-premium text-sm"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {LIST_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="input-premium text-sm"
            aria-label="Filter by theme"
          >
            <option value="">All themes</option>
            {OUTREACH_THEMES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <span className="text-xs text-navy-600 md:ml-auto shrink-0">
            {casesLoading
              ? 'Loading…'
              : casesTruncated
                ? `Showing first ${cases.length} cases — narrow the filters`
                : `${cases.length} case${cases.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {/* Cases table */}
      <CasesTable
        cases={cases}
        loading={casesLoading}
        sort={sort}
        sortDir={sortDir}
        onSort={handleSort}
        onSelect={setSelectedCase}
        canUpload={isSuperadmin}
      />

      {/* Detail slide panel */}
      <CaseDetailPanel caseId={selectedCase} onClose={() => setSelectedCase(null)} />
    </div>
  );
}
