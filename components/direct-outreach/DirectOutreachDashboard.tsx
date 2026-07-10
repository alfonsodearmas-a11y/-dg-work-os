'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarX, CheckCircle2, Inbox, Radio, Search, Upload, UserX, X } from 'lucide-react';
import { MultiSelect } from '@/components/oversight/shared';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
import { fmtGuyanaDateTime } from '@/lib/format';
import type {
  OutreachCaseRow,
  OutreachSortField,
  OutreachSummary,
  OutreachUploadSummary,
} from '@/lib/direct-outreach/types';
import {
  OUTREACH_AGENCIES,
  OUTREACH_DEFAULT_SORT,
  OUTREACH_STALE_OFFICER_DAYS,
  OUTREACH_STATUSES,
  OUTREACH_THEMES,
  OUTREACH_WORKING_STATUSES,
  OUTREACH_WORKING_STATUS_LABELS,
  UNASSIGNED_OFFICER,
} from '@/lib/direct-outreach/types';
import { OutreachStatCard } from './OutreachStatCard';
import { AgencyScorecards } from './AgencyScorecards';
import { OfficerLoadTable } from './OfficerLoadTable';
import { CasesTable } from './CasesTable';
import { CaseDetailPanel } from './CaseDetailPanel';

// Resolved is synced but excluded from the open backlog list.
const LIST_STATUSES = OUTREACH_STATUSES.filter((s) => s !== 'Resolved');

interface Toggles {
  high: boolean;
  stalled60: boolean;
  stalled90: boolean;
  target: boolean;
  overdue: boolean;
  stale: boolean;
  officerOverdue: boolean;
  mine: boolean;
}

const NO_TOGGLES: Toggles = {
  high: false, stalled60: false, stalled90: false, target: false, overdue: false,
  stale: false, officerOverdue: false, mine: false,
};

const TOGGLE_PILLS: { key: keyof Toggles; label: string }[] = [
  { key: 'high', label: 'High priority' },
  { key: 'stale', label: `No officer update >${OUTREACH_STALE_OFFICER_DAYS}d` },
  { key: 'officerOverdue', label: 'Officer overdue' },
  { key: 'stalled60', label: 'OP stalled >60d' },
  { key: 'stalled90', label: 'OP stalled >90d' },
  { key: 'target', label: 'Has target date' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'mine', label: 'Assigned to me' },
];

function TogglePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-gold-500/15 text-gold-500 border border-gold-500/30">
      {label}
      <button type="button" onClick={onClear} aria-label={`Clear ${label}`} className="hover:text-white transition-colors">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function DirectOutreachDashboard() {
  const { effectiveUser } = useEffectiveUser();
  const isSuperadmin = effectiveUser.role === 'superadmin';
  const searchParams = useSearchParams();

  const [summary, setSummary] = useState<OutreachSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [cases, setCases] = useState<OutreachCaseRow[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [casesTruncated, setCasesTruncated] = useState(false);
  const [casesError, setCasesError] = useState<string | null>(null);

  // Multi-select filters (all AND-combined server-side).
  const [agencies, setAgencies] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [themes, setThemes] = useState<string[]>([]);
  const [outreaches, setOutreaches] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [officers, setOfficers] = useState<string[]>([]);
  const [workingStatuses, setWorkingStatuses] = useState<string[]>([]);
  const [toggles, setToggles] = useState<Toggles>(NO_TOGGLES);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Q6 default: officer-action staleness, most neglected (never touched) first.
  const [sort, setSort] = useState<OutreachSortField>(OUTREACH_DEFAULT_SORT);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // ?case= deep link (notification links land here). Fully DERIVED selection:
  // user actions record an override relative to the current URL param, so a
  // NEW ?case= value (second notification click while already on the page)
  // re-opens the panel without any effect/setState-in-effect.
  const caseParam = searchParams.get('case');
  const validCaseParam = caseParam && /^\d+$/.test(caseParam) ? caseParam : null;
  const [manualSelection, setManualSelection] = useState<{ param: string | null; case: number | null } | null>(null);
  const selectedCase =
    manualSelection && manualSelection.param === validCaseParam
      ? manualSelection.case
      : validCaseParam
        ? Number(validCaseParam)
        : null;
  const setSelectedCase = (id: number | null) =>
    setManualSelection({ param: validCaseParam, case: id });

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
    if (agencies.length) params.set('agencies', agencies.join(','));
    if (statuses.length) params.set('statuses', statuses.join(','));
    if (themes.length) params.set('themes', themes.join(','));
    if (outreaches.length) params.set('outreaches', outreaches.join(','));
    if (regions.length) params.set('regions', regions.join(','));
    if (officers.length) params.set('officers', officers.join(','));
    if (workingStatuses.length) params.set('working', workingStatuses.join(','));
    if (toggles.high) params.set('high', '1');
    if (toggles.stalled60) params.set('stalled60', '1');
    if (toggles.stalled90) params.set('stalled90', '1');
    if (toggles.target) params.set('target', '1');
    if (toggles.overdue) params.set('overdue', '1');
    if (toggles.stale) params.set('stale', '1');
    if (toggles.officerOverdue) params.set('officer_overdue', '1');
    if (toggles.mine) params.set('mine', '1');
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
  }, [agencies, statuses, themes, outreaches, regions, officers, workingStatuses, toggles, debouncedSearch, sort, sortDir]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const refreshAll = useCallback(() => {
    loadSummary();
    loadCases();
  }, [loadSummary, loadCases]);

  const handleSort = (field: OutreachSortField) => {
    if (field === sort) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setSortDir(
        field === 'case_id' || field === 'agency' || field === 'status' || field === 'theme'
          || field === 'assignee' || field === 'working_status'
          ? 'asc'
          : 'desc',
      );
    }
  };

  const setToggle = (key: keyof Toggles, value?: boolean) =>
    setToggles((t) => ({ ...t, [key]: value ?? !t[key] }));

  const handleUpload = async (file: File) => {
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
        const message = await res
          .json()
          .then((body) => body?.error as string | undefined)
          .catch(() => undefined);
        if (res.status === 413) throw new Error(message || 'Workbook exceeds the 4 MB upload limit');
        throw new Error(message || `Upload failed (${res.status})`);
      }
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
  const options = summary?.filter_options;

  // Union the currently-selected officers into the options so a selection
  // doesn't vanish (and become unclearable) when its last open case drops out.
  const knownOfficerIds = new Set((options?.officers ?? []).map((o) => o.id));
  const officerOptions = [
    { value: UNASSIGNED_OFFICER, label: 'Unassigned' },
    ...(options?.officers ?? []).map((o) => ({ value: o.id, label: o.name ?? 'Unknown' })),
    ...officers
      .filter((id) => id !== UNASSIGNED_OFFICER && !knownOfficerIds.has(id))
      .map((id) => ({ value: id, label: 'Selected officer' })),
  ];

  // Active-filter chips (multi-selects summarized per group; toggles individually).
  const chips: { label: string; onClear: () => void }[] = [
    ...(agencies.length ? [{ label: `Agency: ${agencies.join(', ')}`, onClear: () => setAgencies([]) }] : []),
    ...(statuses.length ? [{ label: `Status: ${statuses.join(', ')}`, onClear: () => setStatuses([]) }] : []),
    ...(themes.length ? [{ label: `Theme (${themes.length})`, onClear: () => setThemes([]) }] : []),
    ...(outreaches.length ? [{ label: `Outreach (${outreaches.length})`, onClear: () => setOutreaches([]) }] : []),
    ...(regions.length ? [{ label: `Region (${regions.length})`, onClear: () => setRegions([]) }] : []),
    ...(officers.length ? [{ label: `Officer (${officers.length})`, onClear: () => setOfficers([]) }] : []),
    ...(workingStatuses.length ? [{ label: `Progress (${workingStatuses.length})`, onClear: () => setWorkingStatuses([]) }] : []),
    ...TOGGLE_PILLS.filter((p) => toggles[p.key]).map((p) => ({
      label: p.label,
      onClear: () => setToggle(p.key, false),
    })),
    ...(debouncedSearch ? [{ label: `“${debouncedSearch}”`, onClear: () => setSearch('') }] : []),
  ];

  const clearAllFilters = () => {
    setAgencies([]); setStatuses([]); setThemes([]);
    setOutreaches([]); setRegions([]); setOfficers([]); setWorkingStatuses([]);
    setToggles(NO_TOGGLES); setSearch('');
  };

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
            {uploadSummary && uploadSummary.unrecognized_agencies?.length > 0 && (
              <p className="text-amber-400 text-sm mt-1">
                Unrecognized agency value{uploadSummary.unrecognized_agencies.length === 1 ? '' : 's'} in the
                workbook: {uploadSummary.unrecognized_agencies.join(', ')} — stored verbatim, check for typos.
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
                e.target.value = '';
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

      {/* KPI row — officer accountability is the module's center of gravity (v3) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <OutreachStatCard
          label="Open Backlog"
          value={totals?.open ?? '—'}
          icon={Inbox}
          iconBg="rgba(212,175,55,0.15)"
          iconColor="#f4d03f"
          sub={totals && totals.unassigned_open > 0 ? `${totals.unassigned_open} unassigned — click to filter` : undefined}
          active={officers.length === 1 && officers[0] === UNASSIGNED_OFFICER}
          onClick={() =>
            setOfficers((prev) =>
              prev.length === 1 && prev[0] === UNASSIGNED_OFFICER ? [] : [UNASSIGNED_OFFICER],
            )
          }
        />
        <OutreachStatCard
          label="Needs Officer Action"
          value={totals?.stale_officer ?? '—'}
          icon={UserX}
          iconBg="rgba(220,38,38,0.15)"
          iconColor="#f87171"
          sub={`no officer update in >${OUTREACH_STALE_OFFICER_DAYS}d`}
          active={toggles.stale}
          onClick={() => setToggle('stale')}
        />
        <OutreachStatCard
          label="Officer Overdue"
          value={totals?.officer_overdue ?? '—'}
          icon={CalendarX}
          iconBg="rgba(220,38,38,0.15)"
          iconColor="#f87171"
          sub="officer-committed dates past due"
          active={toggles.officerOverdue}
          onClick={() => setToggle('officerOverdue')}
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

      {/* Per-officer workload (v3) — row click filters to that officer */}
      {summary && (
        <OfficerLoadTable
          officers={summary.officer_load}
          onSelect={(officerId) => setOfficers([officerId])}
        />
      )}

      {/* Controls */}
      <div className="card-premium p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {isSuperadmin && (
            <MultiSelect
              label="Agency"
              options={OUTREACH_AGENCIES.map((a) => ({ value: a, label: a }))}
              selected={agencies}
              onChange={setAgencies}
            />
          )}
          <MultiSelect
            label="Status"
            options={LIST_STATUSES.map((s) => ({ value: s, label: s }))}
            selected={statuses}
            onChange={setStatuses}
          />
          <MultiSelect
            label="Theme"
            options={OUTREACH_THEMES.map((t) => ({ value: t, label: t }))}
            selected={themes}
            onChange={setThemes}
          />
          <MultiSelect
            label="Outreach"
            options={(options?.outreach_locations ?? []).map((o) => ({ value: o, label: o }))}
            selected={outreaches}
            onChange={setOutreaches}
          />
          <MultiSelect
            label="Region"
            options={(options?.regions ?? []).map((r) => ({ value: r, label: r }))}
            selected={regions}
            onChange={setRegions}
          />
          <MultiSelect
            label="Officer"
            options={officerOptions}
            selected={officers}
            onChange={setOfficers}
          />
          <MultiSelect
            label="Progress"
            options={OUTREACH_WORKING_STATUSES.map((s) => ({
              value: s,
              label: OUTREACH_WORKING_STATUS_LABELS[s],
            }))}
            selected={workingStatuses}
            onChange={setWorkingStatuses}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {TOGGLE_PILLS.map((pill) => (
            <TogglePill
              key={pill.key}
              label={pill.label}
              active={toggles[pill.key]}
              onClick={() => setToggle(pill.key)}
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
          <span className="text-xs text-navy-600 md:ml-auto shrink-0">
            {casesLoading
              ? 'Loading…'
              : casesTruncated
                ? `Showing first ${cases.length} cases — narrow the filters`
                : `${cases.length} case${cases.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {chips.map((chip) => (
              <FilterChip key={chip.label} label={chip.label} onClear={chip.onClear} />
            ))}
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-navy-600 hover:text-gold-500 transition-colors"
            >
              Clear all
            </button>
          </div>
        )}
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
      <CaseDetailPanel
        caseId={selectedCase}
        onClose={() => setSelectedCase(null)}
        onChanged={refreshAll}
      />
    </div>
  );
}
