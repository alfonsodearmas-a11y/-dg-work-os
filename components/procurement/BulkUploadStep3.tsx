'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Info,
} from 'lucide-react';
import { STAGE_CONFIG, type ProcurementStage, PROCUREMENT_STAGES } from '@/lib/procurement-types';
import { AGENCY_NAMES } from '@/lib/constants/agencies';
import { validateRows, type ValidatedRow, type ValidationResult } from '@/lib/procurement/row-validator';
import type { ColumnMapping } from '@/lib/procurement/column-mapper';

// ── Types ────────────────────────────────────────────────────────────────────

interface StepValidationProps {
  rows: Record<string, string>[];
  mappings: ColumnMapping[];
  agency: string;
  defaultStage: ProcurementStage;
  fileName: string;
  onImport: (rows: ValidatedRow[], mode: 'all' | 'valid_only') => void;
  importing: boolean;
  importProgress: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export function StepValidation({
  rows,
  mappings,
  agency,
  defaultStage,
  fileName,
  onImport,
  importing,
  importProgress,
}: StepValidationProps) {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(true);
  const [validatingProgress, setValidatingProgress] = useState(0);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [editOverrides, setEditOverrides] = useState<Record<number, Partial<ValidatedRow['fields']>>>({});
  const [stageOverrides, setStageOverrides] = useState<Record<number, string>>({});
  const [confirmMode, setConfirmMode] = useState<'all' | 'valid_only' | null>(null);

  // ── Run validation ─────────────────────────────────────────────────
  useEffect(() => {
    setValidating(true);
    setValidatingProgress(0);

    // Simulate incremental validation progress for UX
    const total = rows.length;
    let progress = 0;
    const interval = setInterval(() => {
      progress = Math.min(progress + Math.ceil(total / 10), total);
      setValidatingProgress(progress);
      if (progress >= total) clearInterval(interval);
    }, 50);

    // Run synchronous validation after a tick to let the progress show
    const timer = setTimeout(() => {
      const result = validateRows(rows, mappings, defaultStage);
      setValidation(result);
      setValidating(false);
      setValidatingProgress(total);
      clearInterval(interval);
    }, Math.min(rows.length * 5, 500));

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [rows, mappings, defaultStage]);

  // ── Derived data ───────────────────────────────────────────────────

  const getRow = useCallback((vr: ValidatedRow): ValidatedRow => {
    const fieldOverride = editOverrides[vr.rowIndex];
    const stageOverride = stageOverrides[vr.rowIndex];
    if (!fieldOverride && !stageOverride) return vr;
    return {
      ...vr,
      fields: { ...vr.fields, ...fieldOverride },
      resolvedStage: stageOverride ?? vr.resolvedStage,
      // If user overrode a blocked title, un-block it
      status: fieldOverride?.title && vr.status === 'blocked' ? 'warning' : vr.status,
      issues: fieldOverride?.title && vr.issues.includes('Missing required field: title')
        ? vr.issues.filter((i) => i !== 'Missing required field: title')
        : vr.issues,
    };
  }, [editOverrides, stageOverrides]);

  const effectiveRows = validation?.rows.map(getRow) ?? [];
  const importableAll = effectiveRows.filter((r) => r.status !== 'blocked');
  const importableValid = effectiveRows.filter((r) => r.status === 'valid');

  // ── Loading state ──────────────────────────────────────────────────

  if (validating) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-gold-500 animate-spin mb-4" />
        <p className="text-sm text-white font-medium">
          Validating row {validatingProgress} of {rows.length}...
        </p>
        <div className="w-48 h-1.5 bg-navy-800 rounded-full mt-3 overflow-hidden">
          <div
            className="h-full bg-gold-500 rounded-full transition-all"
            style={{ width: `${(validatingProgress / rows.length) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  if (!validation) return null;

  const { counts } = validation;
  const agencyName = AGENCY_NAMES[agency] ?? agency;

  // ── Confirmation dialog ────────────────────────────────────────────

  if (confirmMode) {
    const count = confirmMode === 'all' ? importableAll.length : importableValid.length;
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gold-500/10 flex items-center justify-center mb-4">
          <Info className="h-7 w-7 text-gold-500" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Confirm Import</h3>
        <p className="text-sm text-slate-400 max-w-md mb-6">
          Import <span className="text-white font-semibold">{count} packages</span> to the{' '}
          <span className="text-gold-500 font-semibold">{agencyName}</span> pipeline?
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setConfirmMode(null)}
            disabled={importing}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-navy-800 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={() => onImport(confirmMode === 'all' ? importableAll : importableValid, confirmMode)}
            disabled={importing}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-gold-500 text-navy-950 hover:bg-[#e5c348] transition-colors disabled:opacity-60"
          >
            {importing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Importing... {importProgress} of {count}
              </>
            ) : (
              `Import ${count} Packages`
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Import progress overlay ────────────────────────────────────────

  if (importing) {
    const total = importableAll.length;
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-gold-500 animate-spin mb-4" />
        <p className="text-sm text-white font-medium">
          Importing... {importProgress} of {total}
        </p>
        <div className="w-48 h-1.5 bg-navy-800 rounded-full mt-3 overflow-hidden">
          <div
            className="h-full bg-gold-500 rounded-full transition-all"
            style={{ width: `${(importProgress / total) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  // ── Main validation table ──────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar — sticky */}
      <div className="sticky top-0 z-10 bg-navy-950 pb-3">
        <div className="flex items-center gap-4 px-3 py-2.5 rounded-lg bg-navy-900 border border-navy-800">
          <SummaryBadge color="bg-emerald-400" label="ready" count={counts.valid} />
          <SummaryBadge color="bg-amber-400" label="warnings" count={counts.warning} />
          <SummaryBadge color="bg-red-400" label="blocked" count={counts.blocked} />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-navy-800 flex-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-navy-900 text-navy-600">
              <th className="px-3 py-2 text-left font-medium w-12">#</th>
              <th className="px-3 py-2 text-left font-medium sticky left-0 bg-navy-900 z-[1] min-w-[160px]">Title</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Bid Ref</th>
              <th className="px-3 py-2 text-left font-medium">Stage</th>
              <th className="px-3 py-2 text-left font-medium min-w-[200px]">Issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800/50">
            {effectiveRows.map((vr) => {
              const isExpanded = expandedRow === vr.rowIndex;
              return (
                <TableRow
                  key={vr.rowIndex}
                  row={vr}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedRow(isExpanded ? null : vr.rowIndex)}
                  onFieldChange={(field, value) => {
                    const parsed = field === 'estimated_value'
                      ? { [field]: value ? parseFloat(value) || null : null }
                      : { [field]: value };
                    setEditOverrides((prev) => ({
                      ...prev,
                      [vr.rowIndex]: { ...prev[vr.rowIndex], ...parsed },
                    }));
                  }}
                  onStageChange={(stage) => {
                    setStageOverrides((prev) => ({ ...prev, [vr.rowIndex]: stage }));
                  }}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Action buttons — sticky bottom */}
      <div className="sticky bottom-0 bg-navy-950 pt-3 flex flex-col sm:flex-row gap-2 sm:justify-end">
        {importableValid.length > 0 && importableValid.length < importableAll.length && (
          <button
            onClick={() => setConfirmMode('valid_only')}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-navy-800 text-slate-400 hover:text-white hover:border-navy-700 transition-colors"
          >
            Import Valid Only ({importableValid.length})
          </button>
        )}
        {importableAll.length > 0 && (
          <button
            onClick={() => setConfirmMode('all')}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-gold-500 text-navy-950 hover:bg-[#e5c348] transition-colors"
          >
            Import All ({importableAll.length})
          </button>
        )}
      </div>
    </div>
  );
}

// ── Summary badge ────────────────────────────────────────────────────────────

function SummaryBadge({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-white font-medium text-sm">{count}</span>
      <span className="text-navy-600 text-xs">{label}</span>
    </div>
  );
}

// ── Table row ────────────────────────────────────────────────────────────────

function TableRow({
  row,
  isExpanded,
  onToggle,
  onFieldChange,
  onStageChange,
}: {
  row: ValidatedRow;
  isExpanded: boolean;
  onToggle: () => void;
  onFieldChange: (field: string, value: string) => void;
  onStageChange: (stage: string) => void;
}) {
  const bgClass =
    row.status === 'valid'
      ? 'bg-emerald-500/[0.03]'
      : row.status === 'warning'
        ? 'bg-amber-500/[0.05]'
        : 'bg-red-500/[0.05]';

  const statusIcon =
    row.status === 'valid'
      ? <CheckCircle2 size={14} className="text-emerald-400" />
      : row.status === 'warning'
        ? <AlertTriangle size={14} className="text-amber-400" />
        : <XCircle size={14} className="text-red-400" />;

  const stageColor = row.resolvedStage === 'cancelled'
    ? '#dc2626'
    : STAGE_CONFIG[row.resolvedStage as ProcurementStage]?.color ?? '#94a3b8';

  return (
    <>
      <tr
        className={`${bgClass} hover:bg-navy-900/50 cursor-pointer transition-colors`}
        onClick={onToggle}
      >
        <td className="px-3 py-2 text-navy-600">
          <div className="flex items-center gap-1">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {row.rowIndex}
          </div>
        </td>
        <td className="px-3 py-2 text-white font-medium sticky left-0 z-[1] max-w-[200px] truncate" style={{ backgroundColor: 'inherit' }}>
          {row.fields.title || <span className="text-red-400 italic">Missing</span>}
        </td>
        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
          {row.fields.bid_reference || '—'}
        </td>
        <td className="px-3 py-2">
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
            style={{ backgroundColor: `${stageColor}20`, color: stageColor }}
          >
            {statusIcon}
            {row.resolvedStage === 'cancelled' ? 'Cancelled' : STAGE_CONFIG[row.resolvedStage as ProcurementStage]?.label ?? row.resolvedStage}
          </span>
          {row.stageAutoDetected && (
            <span className="block text-[10px] text-navy-600 mt-0.5">Auto-detected from remarks</span>
          )}
        </td>
        <td className="px-3 py-2 text-xs">
          {row.issues.length > 0 ? (
            <span className={row.status === 'blocked' ? 'text-red-400' : 'text-amber-400'}>
              {row.issues[0]}
              {row.issues.length > 1 && ` +${row.issues.length - 1} more`}
            </span>
          ) : (
            <span className="text-emerald-400/60">OK</span>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className={bgClass}>
          <td colSpan={5} className="px-4 py-3 border-t border-navy-800/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <InlineEdit
                label="Title"
                value={row.fields.title}
                onChange={(v) => onFieldChange('title', v)}
              />
              <InlineEdit
                label="Bid Reference"
                value={row.fields.bid_reference ?? ''}
                onChange={(v) => onFieldChange('bid_reference', v)}
              />
              <InlineEdit
                label="Estimated Value"
                value={row.fields.estimated_value?.toString() ?? ''}
                onChange={(v) => onFieldChange('estimated_value', v)}
              />
              <div>
                <label className="block text-[10px] text-navy-600 mb-1">Stage</label>
                <div className="relative">
                  <select
                    value={row.resolvedStage}
                    onChange={(e) => onStageChange(e.target.value)}
                    className="w-full appearance-none bg-navy-950 border border-navy-800 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-gold-500/50 outline-none pr-6"
                  >
                    {PROCUREMENT_STAGES.map((s) => (
                      <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>
                    ))}
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-navy-600 pointer-events-none" />
                </div>
              </div>
              {row.fields.notes && (
                <div className="sm:col-span-2">
                  <label className="block text-[10px] text-navy-600 mb-1">Notes</label>
                  <p className="text-slate-400 text-xs">{row.fields.notes}</p>
                </div>
              )}
              {row.issues.length > 1 && (
                <div className="sm:col-span-2">
                  <label className="block text-[10px] text-navy-600 mb-1">All Issues</label>
                  <ul className="list-disc list-inside text-amber-400/80 space-y-0.5">
                    {row.issues.map((issue, idx) => <li key={idx}>{issue}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Inline field editor ──────────────────────────────────────────────────────

function InlineEdit({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] text-navy-600 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-navy-950 border border-navy-800 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-gold-500/50 outline-none"
      />
    </div>
  );
}
