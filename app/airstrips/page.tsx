'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  PlaneLanding, Search, Download, Plus, Upload,
  Check, Minus, ChevronUp, ChevronDown,
  LayoutGrid, List, AlertTriangle, RefreshCw, X, MapPin,
  Wrench, ClipboardCheck, Loader2, ChevronRight,
} from 'lucide-react';
import {
  STATUS_CONFIG, CONDITION_CONFIG, FREQUENCY_CONFIG,
  AIRSTRIP_STATUSES, SURFACE_CONDITIONS, FLIGHT_FREQUENCIES,
  quarterFromISODate,
} from '@/lib/airstrip-types';
import type { Airstrip, AirstripMaintenanceLog } from '@/lib/airstrip-types';
import type { AirstripCadence, AirstripResponsibility } from '@/lib/airstrips/warnings';
import { EmptyState } from '@/components/ui/EmptyState';
import { exportToCsv } from '@/lib/export-csv';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import AddEditAirstripModal from '@/components/airstrips/AddEditAirstripModal';
import BulkUploadAirstripsModal from '@/components/airstrips/BulkUploadAirstripsModal';
import CadenceSettingsModal from '@/components/airstrips/CadenceSettingsModal';
import { WarningBadges } from '@/components/airstrips/WarningBadges';
import { AirstripBulkActionBar } from '@/components/airstrips/AirstripBulkActionBar';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { useAirstripOptions, prefetchAirstripOptions } from '@/hooks/useAirstripOptions';

// ── Types ────────────────────────────────────────────────────────────────────

interface AirstripListSummary {
  total: number;
  operational: number;
  limited_or_rehab: number;
  closed: number;
  needs_attention: number;
  overdue: number;
  upcoming: number;
  verification_stale: number;
  pending_verification: number;
}

// Airstrip augmented by the list/detail API (airstrip_overview + warning engine).
export type AirstripRow = Airstrip & {
  last_maintenance_on?: string | null;
  last_verified_on?: string | null;
  target_maintenance_interval_days?: number | null;
  responsible_manager_id?: string | null;
  intervalDays?: number;
  cadence?: AirstripCadence;
  responsibility?: AirstripResponsibility;
};

interface AirstripResponse {
  airstrips: AirstripRow[];
  summary: AirstripListSummary;
  filters: { regions: number[] };
}

type SortField = 'name' | 'region' | 'runway_length_m' | 'surface_condition' | 'last_inspection_date' | 'flight_frequency' | 'status';
type ViewMode = 'table' | 'grid';

// Attention ranking for the "Needs Attention" queue: overdue → due-soon → stale → ok.
const ATTENTION_RANK: Record<string, number> = { overdue: 0, upcoming: 1, stale: 2, ok: 3 };

// ── Helpers ──────────────────────────────────────────────────────────────────

// (WarningBadges moved to components/airstrips/WarningBadges.tsx — shared with detail page.)

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

function DetailField({ label, children, flash }: { label: string; children: React.ReactNode; flash?: boolean }) {
  return (
    <div className={`rounded-xl bg-navy-900/60 border p-3 transition-colors duration-300 ${flash ? 'border-emerald-500/50' : 'border-navy-800/60'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-navy-600">{label}</span>
        {flash && <span className="text-[10px] text-emerald-400 font-medium animate-fade-in">Saved</span>}
      </div>
      {children}
    </div>
  );
}

// ── Inline Editable Field ────────────────────────────────────────────────────

function InlineEditText({
  value, onSave, className, placeholder, mono,
}: {
  value: string | null; onSave: (val: string | null) => void; className?: string; placeholder?: string; mono?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value ?? ''); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim() || null;
    if (trimmed !== (value ?? null)) onSave(trimmed);
    else setDraft(value ?? '');
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`bg-transparent border-b border-gold-500/50 text-sm text-white outline-none w-full py-0.5 ${mono ? 'font-mono' : ''} ${className ?? ''}`}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); } }}
        placeholder={placeholder}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`text-sm text-white hover:text-gold-500 transition-colors text-left cursor-text w-full ${mono ? 'font-mono' : ''} ${className ?? ''}`}
      title="Click to edit"
    >
      {value || <span className="text-navy-600 italic">{placeholder ?? 'Not set'}</span>}
    </button>
  );
}

function InlineEditSelect({
  value, options, onSave, placeholder,
}: {
  value: string | null; options: { value: string; label: string }[]; onSave: (val: string | null) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const current = options.find(o => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-sm text-white hover:text-gold-500 transition-colors text-left cursor-pointer flex items-center gap-1"
        title="Click to change"
      >
        {current?.label ?? value ?? <span className="text-navy-600 italic">{placeholder ?? 'Not set'}</span>}
        <ChevronDown className={`h-3 w-3 text-navy-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-navy-900 border border-navy-700 rounded-xl shadow-xl py-1 min-w-[160px] max-h-48 overflow-y-auto">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onSave(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${opt.value === value ? 'text-gold-500 bg-gold-500/10' : 'text-slate-300 hover:bg-navy-800 hover:text-white'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineEditTextarea({
  value, onSave, placeholder, rows,
}: {
  value: string | null; onSave: (val: string | null) => void; placeholder?: string; rows?: number;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedValueRef = useRef(value);

  useEffect(() => {
    // Only update draft from prop when not focused (avoid overwriting while typing)
    if (!focused) {
      setDraft(value ?? '');
      savedValueRef.current = value;
    }
  }, [value, focused]);

  // Cleanup debounce on unmount
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const debouncedSave = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = text.trim() || null;
      if (trimmed !== (savedValueRef.current ?? null)) {
        savedValueRef.current = trimmed;
        onSave(trimmed);
      }
    }, 800);
  }, [onSave]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    debouncedSave(e.target.value);
  };

  const handleBlur = () => {
    setFocused(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = draft.trim() || null;
    if (trimmed !== (savedValueRef.current ?? null)) {
      savedValueRef.current = trimmed;
      onSave(trimmed);
    }
  };

  return (
    <textarea
      className="w-full bg-transparent text-sm text-slate-300 placeholder:text-navy-600 outline-none resize-none border border-transparent hover:border-navy-700 focus:border-gold-500/50 rounded-lg px-2 py-1.5 transition-colors"
      value={draft}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      placeholder={placeholder}
      rows={rows ?? 3}
    />
  );
}

// ── Drawer Log Maintenance Modal ─────────────────────────────────────────────

function DrawerLogMaintenanceModal({
  open, onClose, airstripId, onSaved,
}: {
  open: boolean; onClose: () => void; airstripId: string; onSaved: () => void;
}) {
  const { options: activityOpts, loading: loadingAct } = useAirstripOptions('activity_type');
  const { options: verifyOpts, loading: loadingVer } = useAirstripOptions('verification_method');

  const [activityType, setActivityType] = useState('');
  const [description, setDescription] = useState('');
  const [performedDate, setPerformedDate] = useState('');
  const [contractor, setContractor] = useState('');
  const [verificationMethod, setVerificationMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setActivityType(''); setDescription(''); setPerformedDate('');
      setContractor(''); setVerificationMethod(''); setNotes('');
    }
  }, [open]);

  const quarter = performedDate ? (quarterFromISODate(performedDate) ?? '') : '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activityType || !performedDate || !verificationMethod) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/airstrips/${airstripId}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_type: activityType,
          activity_description: activityType === 'other' ? description : null,
          performed_date: performedDate,
          contractor_name: contractor,
          verification_method: verificationMethod,
          notes,
        }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Failed'); setSaving(false); return; }
      onSaved();
      onClose();
    } catch { alert('Failed to log maintenance'); }
    finally { setSaving(false); }
  }

  if (!open) return null;

  const inputCls = 'w-full px-3 py-2 rounded-xl bg-navy-900 border border-navy-800 text-white text-sm placeholder:text-navy-600 focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 transition-colors';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center z-[60]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="bg-navy-950 border border-navy-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800">
          <h3 className="text-lg font-semibold text-white">Log Maintenance</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-navy-800 text-navy-600 hover:text-white transition-colors" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-navy-600 uppercase tracking-wide">Activity Type</span>
            <select value={activityType} onChange={e => setActivityType(e.target.value)} className={inputCls} required disabled={loadingAct}>
              <option value="">{loadingAct ? 'Loading…' : 'Select…'}</option>
              {activityOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          {activityType === 'other' && (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-navy-600 uppercase tracking-wide">Description</span>
              <textarea value={description} onChange={e => setDescription(e.target.value)} className={inputCls} rows={2} placeholder="Describe the activity" />
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-navy-600 uppercase tracking-wide">Date Performed</span>
            <input type="date" value={performedDate} onChange={e => setPerformedDate(e.target.value)} className={inputCls} required />
          </label>
          {quarter && <div className="text-xs text-navy-600">Quarter: <span className="text-slate-400">{quarter}</span></div>}
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-navy-600 uppercase tracking-wide">Contractor Name</span>
            <input type="text" value={contractor} onChange={e => setContractor(e.target.value)} className={inputCls} placeholder="Contractor or team" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-navy-600 uppercase tracking-wide">Verification Method</span>
            <select value={verificationMethod} onChange={e => setVerificationMethod(e.target.value)} className={inputCls} required disabled={loadingVer}>
              <option value="">{loadingVer ? 'Loading…' : 'Select…'}</option>
              {verifyOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-navy-600 uppercase tracking-wide">Notes</span>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} rows={2} placeholder="Optional notes" />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
            <button type="submit" disabled={saving || !activityType || !performedDate || !verificationMethod} className="btn-gold px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-40">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Log Maintenance
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Airstrip Detail Drawer Content ───────────────────────────────────────────

function AirstripDrawerContent({
  airstrip,
  onFieldSaved,
}: {
  airstrip: AirstripRow;
  onFieldSaved: (updated: Partial<Airstrip>) => void;
}) {
  const { options: conditionOpts } = useAirstripOptions('condition');
  const { options: statusOpts } = useAirstripOptions('status');
  const { options: frequencyOpts } = useAirstripOptions('flight_frequency');
  const { options: surfaceOpts } = useAirstripOptions('surface_type');
  const { labelFor: activityLabel } = useAirstripOptions('activity_type');
  const { labelFor: verifyLabel } = useAirstripOptions('verification_method');

  const [savedFlash, setSavedFlash] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [maintenanceLogs, setMaintenanceLogs] = useState<AirstripMaintenanceLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [statusReasonModal, setStatusReasonModal] = useState<{ newStatus: string } | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); }, []);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/airstrips/${airstrip.id}/maintenance`);
      if (res.ok) {
        const json = await res.json();
        setMaintenanceLogs((json.maintenance ?? []).slice(0, 5));
      }
    } catch { /* non-critical */ }
    finally { setLoadingLogs(false); }
  }, [airstrip.id]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const flash = (field: string) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setSavedFlash(field);
    flashTimerRef.current = setTimeout(() => setSavedFlash(''), 1500);
  };

  const saveField = async (updates: Record<string, unknown>, fieldName: string) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/airstrips/${airstrip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Save failed' }));
        setSaveError(err.error || 'Save failed');
        return;
      }
      const { airstrip: updated } = await res.json();
      onFieldSaved(updated);
      flash(fieldName);
    } catch {
      setSaveError('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Save error banner */}
      {saveError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <span className="text-xs text-red-400 flex-1">{saveError}</span>
          <button onClick={() => setSaveError(null)} className="text-red-400 hover:text-white"><X className="h-3 w-3" /></button>
        </div>
      )}

      {/* Status / Condition / Frequency badges — clickable */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="space-y-1">
          <span className="text-[10px] text-navy-600 uppercase tracking-wider block">Status</span>
          <InlineEditSelect
            value={airstrip.status}
            options={statusOpts.length > 0 ? statusOpts.map(o => ({ value: o.value, label: o.label })) : AIRSTRIP_STATUSES.map(s => ({ value: s, label: STATUS_CONFIG[s].label }))}
            onSave={(val) => {
              if (val && val !== airstrip.status) {
                setStatusReasonModal({ newStatus: val });
                setStatusReason('');
              }
            }}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-navy-600 uppercase tracking-wider block">Condition</span>
          <InlineEditSelect
            value={airstrip.surface_condition}
            options={conditionOpts.length > 0 ? conditionOpts.map(o => ({ value: o.value, label: o.label })) : SURFACE_CONDITIONS.map(c => ({ value: c, label: c }))}
            onSave={(val) => saveField({ surface_condition: val }, 'surface_condition')}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-navy-600 uppercase tracking-wider block">Frequency</span>
          <InlineEditSelect
            value={airstrip.flight_frequency}
            options={frequencyOpts.length > 0 ? frequencyOpts.map(o => ({ value: o.value, label: o.label })) : FLIGHT_FREQUENCIES.map(f => ({ value: f, label: f }))}
            onSave={(val) => saveField({ flight_frequency: val }, 'flight_frequency')}
          />
        </div>
      </div>

      {/* Maintenance warnings (overdue / due soon / verification stale) */}
      {airstrip.cadence && airstrip.cadence.warnings.length > 0 && (
        <div className="px-1"><WarningBadges cadence={airstrip.cadence} /></div>
      )}

      {/* ── Infrastructure ── */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-navy-600 uppercase tracking-wider">Runway & Infrastructure</h3>
        <div className="grid grid-cols-2 gap-3">
          <DetailField label="Runway Length (m)" flash={savedFlash === 'runway_length_m'}>
            <InlineEditText
              value={airstrip.runway_length_m != null ? String(airstrip.runway_length_m) : null}
              onSave={(val) => saveField({ runway_length_m: val ? Number(val) : null }, 'runway_length_m')}
              placeholder="—"
              mono
            />
          </DetailField>
          <DetailField label="Runway Width (m)" flash={savedFlash === 'runway_width_m'}>
            <InlineEditText
              value={airstrip.runway_width_m != null ? String(airstrip.runway_width_m) : null}
              onSave={(val) => saveField({ runway_width_m: val ? Number(val) : null }, 'runway_width_m')}
              placeholder="—"
              mono
            />
          </DetailField>
          <DetailField label="Surface Type" flash={savedFlash === 'surface_type'}>
            <InlineEditSelect
              value={airstrip.surface_type}
              options={surfaceOpts.length > 0 ? surfaceOpts.map(o => ({ value: o.value, label: o.label })) : []}
              onSave={(val) => saveField({ surface_type: val }, 'surface_type')}
              placeholder="Not set"
            />
          </DetailField>
          <DetailField label="Engineered" flash={savedFlash === 'engineered_structure'}>
            <button
              type="button"
              onClick={() => saveField({ engineered_structure: !airstrip.engineered_structure }, 'engineered_structure')}
              className="text-sm flex items-center gap-1.5 hover:opacity-80 transition-opacity"
              title="Click to toggle"
            >
              {airstrip.engineered_structure
                ? <><Check className="h-3.5 w-3.5 text-emerald-400" /><span className="text-emerald-400">Yes</span></>
                : <><Minus className="h-3.5 w-3.5 text-navy-600" /><span className="text-navy-600">No</span></>
              }
            </button>
          </DetailField>
        </div>
      </div>

      {/* ── Operations ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-navy-600 uppercase tracking-wider">Operations</h3>
          <button
            onClick={() => setLogModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gold-500/10 border border-gold-500/30 text-gold-500 text-xs hover:bg-gold-500/20 transition-colors"
          >
            <Wrench className="h-3 w-3" /> Log Maintenance
          </button>
        </div>
        <DetailField label="Last Inspection" flash={savedFlash === 'last_inspection_date'}>
          <span className="text-sm text-white">{formatDate(airstrip.last_inspection_date)}</span>
        </DetailField>

        {/* Maintenance timeline */}
        {loadingLogs ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-navy-600" />
          </div>
        ) : maintenanceLogs.length > 0 ? (
          <div className="space-y-0">
            <span className="text-[10px] text-navy-600 uppercase tracking-wider">Recent Maintenance</span>
            <div className="mt-2 space-y-1">
              {maintenanceLogs.map(log => (
                <div key={log.id} className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-navy-900/40 transition-colors group">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-navy-600 shrink-0 group-hover:bg-gold-500 transition-colors" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-white font-medium">{activityLabel(log.activity_type)}</span>
                      {log.contractor_name && (
                        <span className="text-[10px] text-navy-600">by {log.contractor_name}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-navy-600">
                      {formatDate(log.performed_date)}
                      {log.verification_method && ` · ${verifyLabel(log.verification_method)}`}
                    </span>
                  </div>
                  {log.verified && <Check className="h-3 w-3 text-emerald-400 mt-1 shrink-0" aria-label="Verified" />}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-navy-600 italic">No maintenance logged yet.</p>
        )}
      </div>

      {/* ── Notes ── */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-navy-600 uppercase tracking-wider">Notes</h3>
        <DetailField label="Remarks" flash={savedFlash === 'remarks'}>
          <InlineEditTextarea
            value={airstrip.remarks}
            onSave={(val) => saveField({ remarks: val }, 'remarks')}
            placeholder="Add remarks..."
            rows={3}
          />
        </DetailField>
        <DetailField label="Airside Buildings" flash={savedFlash === 'airside_buildings'}>
          <InlineEditTextarea
            value={airstrip.airside_buildings}
            onSave={(val) => saveField({ airside_buildings: val }, 'airside_buildings')}
            placeholder="Describe airside buildings..."
            rows={2}
          />
        </DetailField>
      </div>

      {/* ── Location ── */}
      {(airstrip.coordinates_lat != null && airstrip.coordinates_lon != null) && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-navy-600 uppercase tracking-wider">Location</h3>
          <div className="rounded-xl bg-navy-900/60 border border-navy-800/60 p-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-navy-600 shrink-0" />
            <span className="text-sm text-slate-400 font-mono">
              {airstrip.coordinates_lat?.toFixed(4)}, {airstrip.coordinates_lon?.toFixed(4)}
            </span>
          </div>
        </div>
      )}

      {/* Full detail page link */}
      <Link
        href={`/airstrips/${airstrip.id}`}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-navy-900 border border-navy-800 hover:border-gold-500 text-slate-400 hover:text-white transition-colors text-xs"
      >
        <ClipboardCheck className="h-3.5 w-3.5" /> Inspections, Photos & History
        <ChevronRight className="h-3 w-3 ml-auto" />
      </Link>

      {/* Saving indicator */}
      {saving && (
        <div className="flex items-center justify-center gap-2 text-xs text-navy-600">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
        </div>
      )}

      {/* Log Maintenance modal (from drawer) */}
      <DrawerLogMaintenanceModal
        open={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        airstripId={airstrip.id}
        onSaved={() => { fetchLogs(); }}
      />

      {/* Status change reason modal */}
      {statusReasonModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center z-[60]" onClick={() => setStatusReasonModal(null)}>
          <div
            role="dialog"
            aria-modal="true"
            className="bg-navy-950 border border-navy-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800">
              <h3 className="text-sm font-semibold text-white">Reason for Status Change</h3>
              <button onClick={() => setStatusReasonModal(null)} className="p-1.5 rounded-lg hover:bg-navy-800 text-navy-600 hover:text-white transition-colors" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <textarea
                className="w-full px-3 py-2 rounded-xl bg-navy-900 border border-navy-800 text-white text-sm placeholder:text-navy-600 focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 transition-colors"
                value={statusReason}
                onChange={e => setStatusReason(e.target.value)}
                placeholder="Why is the status changing?"
                rows={3}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setStatusReasonModal(null)} className="btn-navy px-3 py-1.5 text-xs">Cancel</button>
                <button
                  onClick={() => {
                    if (!statusReason.trim()) return;
                    saveField({ status: statusReasonModal.newStatus, status_change_reason: statusReason.trim() }, 'status');
                    setStatusReasonModal(null);
                  }}
                  disabled={!statusReason.trim()}
                  className="btn-gold px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  Change Status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
  const { canEdit: canEditModule } = useModuleAccess();
  const canEditAirstrips = canEditModule('airstrips');

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
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Multi-select state ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionMode = selectedIds.size > 0;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds(prev => {
      const allSelected = ids.every(id => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

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

  // Prefetch dropdown options on mount
  useEffect(() => {
    prefetchAirstripOptions(['activity_type', 'verification_method', 'condition', 'status', 'flight_frequency', 'surface_type']);
  }, []);

  // When a field is saved in the drawer, update the airstrip in local state
  const handleDrawerFieldSaved = useCallback((updated: Partial<Airstrip>) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        airstrips: prev.airstrips.map(a =>
          a.id === updated.id ? { ...a, ...updated } : a,
        ),
      };
    });
  }, []);

  // ── Bulk update handler ──
  const handleBulkUpdate = useCallback(async (updates: Record<string, unknown>, reason?: string) => {
    const idSet = new Set(selectedIds);
    const ids = Array.from(idSet);

    // Optimistic update — Set.has is O(1) vs Array.includes O(n)
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        airstrips: prev.airstrips.map(a =>
          idSet.has(a.id) ? { ...a, ...updates } as Airstrip : a,
        ),
      };
    });
    clearSelection();

    try {
      const res = await fetch('/api/airstrips/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ airstripIds: ids, updates, reason }),
      });
      if (!res.ok) {
        // Revert on failure — refetch
        fetchAirstrips();
      }
    } catch {
      fetchAirstrips();
    }
  }, [selectedIds, clearSelection, fetchAirstrips]);

  // ── Sort handler ──
  function handleSort(field: SortField) {
    if (sort === field) {
      setDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(field);
      setDir('asc');
    }
  }

  // Clear selection when filters change (skip initial mount)
  const filterKey = `${search}|${region}|${status}|${condition}|${frequency}`;
  const prevFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      clearSelection();
      prevFilterKeyRef.current = filterKey;
    }
  }, [filterKey, clearSelection]);

  function clearFilters() {
    setSearch(''); setRegion(''); setStatus(''); setCondition(''); setFrequency('');
    setSort('name'); setDir('asc');
  }

  const hasActiveFilters = !!(search || region || status || condition || frequency);

  const airstrips = data?.airstrips || [];
  const summary = data?.summary;
  const availableRegions = data?.filters?.regions || [];

  // Strips needing attention, ranked overdue → due-soon → stale, then by days overdue.
  const attentionItems = React.useMemo(
    () =>
      airstrips
        .filter(a => a.cadence && a.cadence.attentionLevel !== 'ok')
        .sort((x, y) => {
          const r = ATTENTION_RANK[x.cadence!.attentionLevel] - ATTENTION_RANK[y.cadence!.attentionLevel];
          if (r !== 0) return r;
          return (y.cadence!.daysOverdue ?? -Infinity) - (x.cadence!.daysOverdue ?? -Infinity);
        }),
    [airstrips],
  );
  const displayedAirstrips = attentionOnly ? attentionItems : airstrips;

  const selectedAirstrip = airstrips.find(a => a.id === selectedAirstripId) ?? null;
  const allSelected = React.useMemo(
    () => airstrips.length > 0 && airstrips.every(a => selectedIds.has(a.id)),
    [airstrips, selectedIds],
  );
  const airstripIds = React.useMemo(() => airstrips.map(a => a.id), [airstrips]);

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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <StatCard label="Total Airstrips" value={summary.total} color="#94a3b8" />
          <StatCard label="Operational" value={summary.operational} color="#10b981" />
          <StatCard label="Limited / Rehab" value={summary.limited_or_rehab} color="#d4af37" />
          <StatCard label="Closed" value={summary.closed} color="#dc2626" />
          <StatCard label="Needs Attention" value={summary.needs_attention} color="#f97316" pulse={summary.needs_attention > 0} />
          <StatCard label="Overdue" value={summary.overdue} color="#dc2626" pulse={summary.overdue > 0} />
          <StatCard label="Pending Verification" value={summary.pending_verification} color="#60a5fa" />
        </div>
      )}

      {/* Needs Attention — pinned queue of strips off their maintenance cadence */}
      {!loading && !error && attentionItems.length > 0 && (
        <div className="card-premium p-4 border-orange-500/30">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-white">Needs Attention</h2>
            <span className="text-xs text-navy-600">{attentionItems.length} airstrip{attentionItems.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-2">
            {attentionItems.slice(0, 8).map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedAirstripId(a.id)}
                className="w-full flex items-start justify-between gap-3 text-left px-3 py-2 rounded-lg bg-navy-900/50 hover:bg-navy-900 border border-navy-800 transition-colors"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-white">{a.name}</span>
                  <span className="text-xs text-navy-600 ml-2">Region {a.region}</span>
                  <div className="mt-1"><WarningBadges cadence={a.cadence} /></div>
                </div>
                <ChevronRight className="h-4 w-4 text-navy-600 shrink-0 mt-0.5" />
              </button>
            ))}
            {attentionItems.length > 8 && (
              <button onClick={() => setAttentionOnly(true)} className="text-xs text-gold-500 hover:text-gold-400 pt-1">
                View all {attentionItems.length} →
              </button>
            )}
          </div>
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
            {selectionMode && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold-500/20 border border-gold-500/40 text-xs text-gold-500 font-medium">
                {selectedIds.size} of {airstrips.length} selected
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
            <button
              onClick={() => setAttentionOnly(v => !v)}
              className={`px-3 py-1.5 text-xs flex items-center gap-1.5 rounded-lg border transition-colors ${
                attentionOnly ? 'bg-orange-500/15 border-orange-500/40 text-orange-400' : 'btn-navy'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Needs Attention
              {summary && summary.needs_attention > 0 && (
                <span className="ml-0.5 px-1.5 rounded-full bg-orange-500/30 text-orange-300 text-[10px]">{summary.needs_attention}</span>
              )}
            </button>
            {canEditAirstrips && (
              <>
                <button onClick={() => setSettingsOpen(true)} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Cadence
                </button>
                <button onClick={() => setBulkUploadOpen(true)} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5" /> Bulk Upload
                </button>
                <button onClick={() => setAddModalOpen(true)} className="btn-gold px-3 py-1.5 text-xs flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add Airstrip
                </button>
              </>
            )}

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
      {!loading && !error && displayedAirstrips.length === 0 && (
        <EmptyState
          icon={<PlaneLanding className="h-12 w-12" />}
          title={attentionOnly ? 'Nothing needs attention' : 'No airstrips found'}
          description={
            attentionOnly ? 'All airstrips are within their maintenance cadence.'
            : hasActiveFilters ? 'Try adjusting your filters.'
            : 'Airstrip data has not been loaded yet.'
          }
          action={
            attentionOnly ? <button onClick={() => setAttentionOnly(false)} className="btn-navy px-4 py-2 text-sm">Show all</button>
            : hasActiveFilters ? <button onClick={clearFilters} className="btn-navy px-4 py-2 text-sm">Clear Filters</button>
            : undefined
          }
        />
      )}

      {/* Table View */}
      {!loading && !error && displayedAirstrips.length > 0 && viewMode === 'table' && (
        <div className="overflow-x-auto rounded-xl border border-navy-800">
          <table className="table-premium min-w-full">
            <thead>
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => toggleSelectAll(airstripIds)}
                    aria-label="Select all airstrips"
                    className="w-4 h-4 rounded border-navy-800 accent-gold-500 cursor-pointer"
                  />
                </th>
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
              {displayedAirstrips.map((a) => {
                const isChecked = selectedIds.has(a.id);
                return (
                  <tr
                    key={a.id}
                    className={`hover:bg-navy-900/40 cursor-pointer transition-colors border-t border-navy-800/40 ${
                      isChecked ? 'border-l-2 border-l-gold-500 !bg-[#1e2d4a]' : ''
                    } ${selectedAirstrip?.id === a.id && !isChecked ? 'bg-gold-500/10' : ''}`}
                    onClick={() => setSelectedAirstripId(a.id)}
                  >
                    <td className="w-10 px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(a.id)}
                        aria-label={`Select ${a.name}`}
                        className="w-4 h-4 rounded border-navy-800 accent-gold-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-white hover:text-gold-500 transition-colors">{a.name}</span>
                        <WarningBadges cadence={a.cadence} compact />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-navy-800 text-xs font-medium text-white">{a.region}</span>
                    </td>
                    <td className="px-3 py-2.5"><ConfigBadge value={a.surface_condition} config={CONDITION_CONFIG} /></td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <span className="text-xs text-slate-400">{formatDate(a.last_inspection_date)}</span>
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
      {!loading && !error && displayedAirstrips.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedAirstrips.map(a => {
            const isChecked = selectedIds.has(a.id);
            return (
              <div key={a.id} className="relative group">
                {/* Checkbox overlay */}
                <div
                  className={`absolute left-2 top-2 z-10 transition-opacity ${
                    selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelect(a.id)}
                    onClick={e => e.stopPropagation()}
                    aria-label={`Select ${a.name}`}
                    className="w-4 h-4 rounded border-navy-800 accent-gold-500 cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAirstripId(a.id)}
                  className={`card-premium p-0 overflow-hidden text-left w-full transition-all ${
                    isChecked ? 'ring-1 ring-gold-500/40 border-l-2 border-l-gold-500 !bg-[#1e2d4a]' : ''
                  } ${selectedAirstrip?.id === a.id && !isChecked ? 'ring-1 ring-gold-500/50' : ''}`}
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

                    <div className="text-xs text-slate-400">Inspected: {formatDate(a.last_inspection_date)}</div>
                    <WarningBadges cadence={a.cadence} compact />
                  </div>
                </button>
              </div>
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
          <AirstripDrawerContent
            airstrip={selectedAirstrip}
            onFieldSaved={handleDrawerFieldSaved}
          />
        )}
      </SlidePanel>

      {/* Add Airstrip Modal */}
      <AddEditAirstripModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSaved={fetchAirstrips}
      />

      {/* Bulk Upload Modal */}
      <BulkUploadAirstripsModal
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onImported={fetchAirstrips}
      />

      {/* Cadence Settings Modal */}
      <CadenceSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={fetchAirstrips}
      />

      {/* Bulk Action Bar */}
      <AirstripBulkActionBar
        count={selectedIds.size}
        onClear={clearSelection}
        onBulkUpdate={handleBulkUpdate}
      />
    </div>
  );
}
