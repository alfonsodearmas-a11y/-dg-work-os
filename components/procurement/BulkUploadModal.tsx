'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  X,
  ArrowLeft,
  ArrowRight,
  Upload,
  FileSpreadsheet,
  Download,
  Check,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useDropZone } from '@/hooks/useDropZone';
import { SELECTABLE_AGENCIES, AGENCY_NAMES } from '@/lib/constants/agencies';
import { STAGE_CONFIG, type ProcurementStage, PROCUREMENT_STAGES } from '@/lib/procurement-types';
import { parseSpreadsheet, type ParseResult } from '@/lib/procurement/bulk-upload-parser';
import { mapColumns, type ColumnMapping } from '@/lib/procurement/column-mapper';
import { generateTemplate } from '@/lib/procurement/template-generator';
import type { ValidatedRow } from '@/lib/procurement/row-validator';
import { StepValidation } from './BulkUploadStep3';
import { fmtFileSize, fmtDate } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

const TARGET_FIELDS: { value: string; label: string }[] = [
  { value: 'bid_reference', label: 'Bid Reference' },
  { value: 'title', label: 'Title' },
  { value: 'description', label: 'Description' },
  { value: 'estimated_value', label: 'Estimated Value' },
  { value: 'procurement_method', label: 'Procurement Method' },
  { value: 'opening_date', label: 'Opening Date' },
  { value: 'tender_board', label: 'Tender Board' },
  { value: 'expected_delivery_date', label: 'Expected Delivery Date' },
  { value: 'notes', label: 'Notes' },
];

const STEPS = ['Upload File', 'Column Mapping', 'Validate & Import'] as const;

// ── Props ────────────────────────────────────────────────────────────────────

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

interface RecentBatch {
  id: string;
  agency: string;
  file_name: string;
  row_count: number;
  status: string;
  created_at: string;
  uploaded_by_name: string;
}

export function BulkUploadModal({ isOpen, onClose, onImported }: BulkUploadModalProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userRole = session?.user?.role;
  const userAgency = session?.user?.agency;
  const isDG = userRole === 'dg';

  // ── Step state ─────────────────────────────────────────────────────────
  const [step, setStep] = useState<0 | 1 | 2>(0);

  // ── Step 1: File upload ────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  // ── Step 2: Column mapping ─────────────────────────────────────────────
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [agency, setAgency] = useState(userAgency ?? '');
  const [defaultStage, setDefaultStage] = useState<ProcurementStage>('submitted');

  // ── Step 3: Import ───────────────────────────────────────────────────
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  // ── Recent imports ───────────────────────────────────────────────────
  const [recentBatches, setRecentBatches] = useState<RecentBatch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);

  // ── Helpers ────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setStep(0);
    setFile(null);
    setParseResult(null);
    setSelectedSheet('');
    setParseError(null);
    setParsing(false);
    setMappings([]);
    setAgency(userAgency ?? '');
    setDefaultStage('submitted' as ProcurementStage);
    setImporting(false);
    setImportProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [userAgency]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // ── File handling ──────────────────────────────────────────────────────

  const processFile = useCallback(async (f: File, sheet?: string) => {
    setParseError(null);
    setParsing(true);
    try {
      const ab = await f.arrayBuffer();
      const result = parseSpreadsheet(ab, sheet);

      if (result.rowCount === 0) {
        setParseError('No data rows found in the file. Check that the first row contains headers.');
        setParsing(false);
        return;
      }

      setParseResult(result);
      setSelectedSheet(result.selectedSheet);

      // Auto-map columns
      const autoMappings = mapColumns(result.headers);
      setMappings(autoMappings);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setParsing(false);
    }
  }, []);

  const handleFileDrop = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;

    if (f.size > MAX_FILE_SIZE) {
      setParseError(`File too large (${fmtFileSize(f.size)}). Maximum is 10 MB.`);
      return;
    }

    const ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'));
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setParseError('Unsupported format. Please upload .xlsx, .xls, or .csv files.');
      return;
    }

    setFile(f);
    setParseError(null);
    processFile(f);
  }, [processFile]);

  const handleSheetChange = useCallback((sheet: string) => {
    setSelectedSheet(sheet);
    if (file) processFile(file, sheet);
  }, [file, processFile]);

  const { isDragging, dropZoneProps } = useDropZone({
    onFileDrop: handleFileDrop,
    accept: ACCEPTED_EXTENSIONS,
  });

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileDrop([f]);
  }, [handleFileDrop]);

  const handleDownloadTemplate = useCallback(() => {
    const data = generateTemplate();
    const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'procurement_upload_template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── Mapping helpers ────────────────────────────────────────────────────

  const updateMapping = useCallback((index: number, targetField: string | null) => {
    setMappings(prev => prev.map((m, i) =>
      i === index ? { ...m, targetField, confidence: 'high' as const } : m
    ));
  }, []);

  const usedTargets = useMemo(() => {
    const s = new Set<string>();
    for (const m of mappings) {
      if (m.targetField) s.add(m.targetField);
    }
    return s;
  }, [mappings]);

  // ── Import handler ────────────────────────────────────────────────────

  const handleImport = useCallback(async (validatedRows: ValidatedRow[], _mode: 'all' | 'valid_only') => {
    if (!file) return;
    setImporting(true);
    setImportProgress(0);

    const importRows = validatedRows
      .filter((r) => r.status !== 'blocked')
      .map((r) => ({
        title: r.fields.title,
        description: r.fields.description,
        bid_reference: r.fields.bid_reference,
        estimated_value: r.fields.estimated_value,
        procurement_method: r.fields.procurement_method,
        opening_date: r.fields.opening_date,
        tender_board: r.fields.tender_board,
        expected_delivery_date: r.fields.expected_delivery_date,
        notes: r.fields.notes,
        current_stage: r.resolvedStage,
      }));

    // Simulate progress ticks
    const progressInterval = setInterval(() => {
      setImportProgress((p) => Math.min(p + 1, importRows.length - 1));
    }, 100);

    try {
      const res = await fetch('/api/procurement/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agency,
          fileName: file.name,
          rows: importRows,
          defaultStage,
        }),
        signal: AbortSignal.timeout(60000),
      });

      clearInterval(progressInterval);
      setImportProgress(importRows.length);

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Import failed');
        setImporting(false);
        return;
      }

      if (data.failed?.length > 0) {
        toast.warning(`${data.imported} of ${data.total} imported. ${data.failed.length} failed.`);
      } else {
        const cancelledCount = validatedRows.filter((r) => r.resolvedStage === 'cancelled').length;
        const suffix = cancelledCount > 0 ? ` (${cancelledCount} auto-cancelled)` : '';
        toast.success(`${data.imported} packages imported to ${AGENCY_NAMES[agency] ?? agency} pipeline${suffix}`);
      }

      onImported();
      handleClose();
    } catch (err) {
      clearInterval(progressInterval);
      setImporting(false);
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        toast.error('Import timed out. Your data is saved locally, try again.');
      } else {
        toast.error('Import failed. Your data is saved locally, try again.');
      }
    }
  }, [file, agency, defaultStage, onImported, handleClose, toast]);

  // ── Fetch recent batches ───────────────────────────────────────────

  const fetchBatches = useCallback(async () => {
    setBatchesLoading(true);
    try {
      const res = await fetch('/api/procurement/bulk');
      if (res.ok) {
        const data = await res.json();
        setRecentBatches(data.batches || []);
      }
    } catch { /* ignore */ }
    finally { setBatchesLoading(false); }
  }, []);

  useEffect(() => {
    if (isOpen && step === 0) fetchBatches();
  }, [isOpen, step, fetchBatches]);

  const handleRollback = useCallback(async (batchId: string, fileName: string, rowCount: number) => {
    if (!confirm(`Remove all ${rowCount} packages from this import?`)) return;
    try {
      const res = await fetch('/api/procurement/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Rollback failed');
        return;
      }
      toast.success(`Import rolled back. ${data.removed} packages removed.`);
      fetchBatches();
      onImported();
    } catch {
      toast.error('Rollback failed');
    }
  }, [fetchBatches, onImported, toast]);

  // ── Validation ─────────────────────────────────────────────────────────

  const canProceedToMapping = !!parseResult && parseResult.rowCount > 0 && !parsing;
  const canProceedToValidation = !!agency && mappings.some(m => m.targetField === 'title');

  // ── Modal behavior (escape, scroll lock, focus) ────────────────────────

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const focusable = modalRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  // ── Preview table data (first 3 rows) ──────────────────────────────────
  const previewRows = parseResult?.rows.slice(0, 3) ?? [];
  const previewHeaders = parseResult?.headers.slice(0, 6) ?? [];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[46] transition-opacity duration-300"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-upload-title"
        className="fixed inset-0 md:inset-4 lg:inset-y-8 lg:inset-x-[10%] xl:inset-x-[15%] z-50 flex flex-col bg-navy-950 md:rounded-2xl md:border md:border-navy-800 overflow-hidden"
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-navy-900/95 backdrop-blur-sm border-b border-navy-800 px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={handleClose}
                className="p-2 -ml-2 rounded-lg hover:bg-navy-800 text-slate-400 hover:text-white transition-colors md:hidden"
                aria-label="Close"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="p-2 rounded-xl bg-gradient-to-br from-gold-600 to-gold-500">
                <Upload className="text-white" size={20} aria-hidden="true" />
              </div>
              <div>
                <h2 id="bulk-upload-title" className="text-lg md:text-xl font-bold text-white">Bulk Upload</h2>
                <p className="text-slate-400 text-xs md:text-sm">Import procurement packages from a spreadsheet</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="hidden md:flex p-2 rounded-lg hover:bg-navy-800 text-slate-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 mt-4">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                    i < step
                      ? 'bg-gold-500 text-navy-950'
                      : i === step
                        ? 'bg-gold-500/20 text-gold-500 ring-1 ring-gold-500'
                        : 'bg-navy-800 text-navy-600'
                  }`}>
                    {i < step ? <Check size={14} /> : i + 1}
                  </div>
                  <span className={`text-xs font-medium truncate hidden sm:block ${
                    i <= step ? 'text-white' : 'text-navy-600'
                  }`}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px ${i < step ? 'bg-gold-500' : 'bg-navy-800'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6" style={{ WebkitOverflowScrolling: 'touch' }}>
          {step === 0 && (
            <StepUpload
              file={file}
              parseResult={parseResult}
              parseError={parseError}
              parsing={parsing}
              isDragging={isDragging}
              dropZoneProps={dropZoneProps}
              selectedSheet={selectedSheet}
              previewHeaders={previewHeaders}
              previewRows={previewRows}
              fileInputRef={fileInputRef}
              onFileInput={handleFileInput}
              onSheetChange={handleSheetChange}
              onDownloadTemplate={handleDownloadTemplate}
              recentBatches={recentBatches}
              batchesLoading={batchesLoading}
              onRollback={handleRollback}
            />
          )}
          {step === 1 && parseResult && (
            <StepMapping
              mappings={mappings}
              usedTargets={usedTargets}
              agency={agency}
              defaultStage={defaultStage}
              isDG={isDG}
              rowCount={parseResult.rowCount}
              onUpdateMapping={updateMapping}
              onAgencyChange={setAgency}
              onDefaultStageChange={setDefaultStage}
            />
          )}
          {step === 2 && parseResult && (
            <StepValidation
              rows={parseResult.rows}
              mappings={mappings}
              agency={agency}
              defaultStage={defaultStage}
              fileName={file?.name ?? 'upload'}
              onImport={handleImport}
              importing={importing}
              importProgress={importProgress}
            />
          )}
        </div>

        {/* Footer */}
        {(!importing || step < 2) && (
          <div className="flex-shrink-0 border-t border-navy-800 px-4 md:px-6 py-3 md:py-4 bg-navy-900/50 flex items-center justify-between gap-3">
            <div>
              {step > 0 && !importing && (
                <button
                  onClick={() => setStep((s) => (s === 2 ? 1 : 0))}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-navy-800 transition-colors"
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
              )}
            </div>
            <div>
              {step === 0 && (
                <button
                  onClick={() => setStep(1)}
                  disabled={!canProceedToMapping}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-gold-500 text-navy-950 hover:bg-[#e5c348] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                  <ArrowRight size={16} />
                </button>
              )}
              {step === 1 && (
                <button
                  onClick={() => setStep(2)}
                  disabled={!canProceedToValidation}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-gold-500 text-navy-950 hover:bg-[#e5c348] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Step 1: Upload ───────────────────────────────────────────────────────────

interface StepUploadProps {
  file: File | null;
  parseResult: ParseResult | null;
  parseError: string | null;
  parsing: boolean;
  isDragging: boolean;
  dropZoneProps: Record<string, (e: React.DragEvent) => void>;
  selectedSheet: string;
  previewHeaders: string[];
  previewRows: Record<string, string>[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSheetChange: (sheet: string) => void;
  onDownloadTemplate: () => void;
  recentBatches: RecentBatch[];
  batchesLoading: boolean;
  onRollback: (batchId: string, fileName: string, rowCount: number) => void;
}

function StepUpload({
  file,
  parseResult,
  parseError,
  parsing,
  isDragging,
  dropZoneProps,
  selectedSheet,
  previewHeaders,
  previewRows,
  fileInputRef,
  onFileInput,
  onSheetChange,
  onDownloadTemplate,
  recentBatches,
  batchesLoading,
  onRollback,
}: StepUploadProps) {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <div
        {...dropZoneProps}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 md:p-12 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-gold-500 bg-gold-500/5'
            : file && parseResult
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-navy-700 hover:border-navy-600 bg-navy-900/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={onFileInput}
          className="hidden"
        />
        {parsing ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 text-gold-500 animate-spin" />
            <p className="text-sm text-slate-400">Parsing spreadsheet...</p>
          </div>
        ) : file && parseResult ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-white">{file.name}</p>
            <p className="text-xs text-slate-400">
              {fmtFileSize(file.size)} &middot; {parseResult.rowCount} rows detected
            </p>
            <p className="text-xs text-navy-600 mt-1">Click or drop to replace</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
              isDragging ? 'bg-gold-500/20' : 'bg-navy-800'
            }`}>
              <Upload className={`h-6 w-6 transition-colors ${isDragging ? 'text-gold-500' : 'text-navy-600'}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-300">
                Drop an Excel or CSV file here, or click to browse
              </p>
              <p className="text-xs text-navy-600 mt-1">.xlsx, .xls, .csv &middot; Max 10 MB</p>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {parseError && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400">{parseError}</p>
        </div>
      )}

      {/* Sheet selector */}
      {parseResult && parseResult.sheetNames.length > 1 && (
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Sheet</label>
          <div className="relative">
            <select
              value={selectedSheet}
              onChange={(e) => onSheetChange(e.target.value)}
              className="w-full appearance-none bg-navy-900 border border-navy-800 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:ring-1 focus:ring-gold-500/50 focus:border-gold-500/50 outline-none"
            >
              {parseResult.sheetNames.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-600 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Preview table */}
      {parseResult && previewRows.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-2">
            Preview — first {previewRows.length} of {parseResult.rowCount} rows
          </p>
          <div className="overflow-x-auto rounded-lg border border-navy-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-navy-900">
                  {previewHeaders.map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-navy-600 font-medium whitespace-nowrap">{h}</th>
                  ))}
                  {(parseResult.headers.length > 6) && (
                    <th className="px-3 py-2 text-left text-navy-600 font-medium">+{parseResult.headers.length - 6} more</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/50">
                {previewRows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-navy-900/50">
                    {previewHeaders.map((h) => (
                      <td key={h} className="px-3 py-1.5 text-slate-300 whitespace-nowrap max-w-[200px] truncate">{row[h] || '—'}</td>
                    ))}
                    {(parseResult.headers.length > 6) && <td className="px-3 py-1.5 text-navy-600">…</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Download template */}
      <button
        onClick={(e) => { e.stopPropagation(); onDownloadTemplate(); }}
        className="flex items-center gap-1.5 text-xs text-gold-500 hover:text-gold-400 transition-colors"
      >
        <Download size={14} />
        Download blank template
      </button>

      {/* Recent imports */}
      {recentBatches.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 text-xs text-navy-600 hover:text-slate-400 transition-colors"
          >
            {showHistory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Recent imports ({recentBatches.length})
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {recentBatches.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-navy-900/50 border border-navy-800/50 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-white truncate">{b.file_name}</p>
                    <p className="text-navy-600">
                      {b.agency} &middot; {b.row_count} rows &middot; {fmtDate(b.created_at)}
                      {b.status === 'rolled_back' && <span className="text-red-400 ml-1">(rolled back)</span>}
                    </p>
                  </div>
                  {b.status === 'completed' && (
                    <button
                      onClick={() => onRollback(b.id, b.file_name, b.row_count)}
                      className="ml-2 px-2 py-1 rounded text-[10px] font-medium text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                    >
                      Rollback
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step 2: Column Mapping ───────────────────────────────────────────────────

interface StepMappingProps {
  mappings: ColumnMapping[];
  usedTargets: Set<string>;
  agency: string;
  defaultStage: ProcurementStage;
  isDG: boolean;
  rowCount: number;
  onUpdateMapping: (index: number, targetField: string | null) => void;
  onAgencyChange: (agency: string) => void;
  onDefaultStageChange: (stage: ProcurementStage) => void;
}

function StepMapping({
  mappings,
  usedTargets,
  agency,
  defaultStage,
  isDG,
  rowCount,
  onUpdateMapping,
  onAgencyChange,
  onDefaultStageChange,
}: StepMappingProps) {
  return (
    <div className="space-y-5">
      {/* Top bar: Agency + Default Stage */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-xs text-slate-400 mb-1.5">Agency <span className="text-red-400">*</span></label>
          <div className="relative">
            <select
              value={agency}
              onChange={(e) => onAgencyChange(e.target.value)}
              disabled={!isDG}
              className="w-full appearance-none bg-navy-900 border border-navy-800 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:ring-1 focus:ring-gold-500/50 focus:border-gold-500/50 outline-none disabled:opacity-60"
            >
              <option value="">Select agency</option>
              {SELECTABLE_AGENCIES.map((a) => (
                <option key={a} value={a}>{a} — {AGENCY_NAMES[a]}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-600 pointer-events-none" />
          </div>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-slate-400 mb-1.5">Default Stage</label>
          <div className="relative">
            <select
              value={defaultStage}
              onChange={(e) => onDefaultStageChange(e.target.value as ProcurementStage)}
              className="w-full appearance-none bg-navy-900 border border-navy-800 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:ring-1 focus:ring-gold-500/50 focus:border-gold-500/50 outline-none"
            >
              {PROCUREMENT_STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-600 pointer-events-none" />
          </div>
        </div>
      </div>

      {!agency && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-gold-500/10 border border-gold-500/20">
          <AlertCircle className="h-4 w-4 text-gold-500 mt-0.5 shrink-0" />
          <p className="text-sm text-gold-400">Select an agency before proceeding.</p>
        </div>
      )}

      {/* Mapping rows */}
      <div>
        <p className="text-xs text-slate-400 mb-3">Map each spreadsheet column to a procurement field</p>
        <div className="space-y-2">
          {mappings.map((m, i) => (
            <div key={m.sourceHeader} className="flex items-center gap-3 bg-navy-900/50 rounded-lg px-3 py-2.5 border border-navy-800/50">
              {/* Source header */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <ConfidenceDot confidence={m.confidence} />
                  <span className="text-sm text-white truncate">{m.sourceHeader}</span>
                </div>
              </div>

              {/* Arrow */}
              <ArrowRight size={14} className="text-navy-600 shrink-0" />

              {/* Target selector */}
              <div className="flex-1 min-w-0 relative">
                <select
                  value={m.targetField ?? '__skip__'}
                  onChange={(e) => onUpdateMapping(i, e.target.value === '__skip__' ? null : e.target.value)}
                  className="w-full appearance-none bg-navy-950 border border-navy-800 rounded-lg px-3 py-1.5 pr-8 text-sm text-white focus:ring-1 focus:ring-gold-500/50 focus:border-gold-500/50 outline-none"
                >
                  <option value="__skip__">Skip</option>
                  {TARGET_FIELDS.map((tf) => (
                    <option
                      key={tf.value}
                      value={tf.value}
                      disabled={usedTargets.has(tf.value) && m.targetField !== tf.value}
                    >
                      {tf.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-600 pointer-events-none" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      {agency && (
        <p className="text-xs text-slate-400 text-center pt-2">
          <span className="text-white font-medium">{rowCount}</span> rows will be imported to{' '}
          <span className="text-gold-500 font-medium">{AGENCY_NAMES[agency] ?? agency}</span>
        </p>
      )}
    </div>
  );
}

// ── Confidence dot ───────────────────────────────────────────────────────────

function ConfidenceDot({ confidence }: { confidence: ColumnMapping['confidence'] }) {
  const color =
    confidence === 'high'
      ? 'bg-emerald-400'
      : confidence === 'medium'
        ? 'bg-amber-400'
        : 'bg-navy-600';
  return (
    <span
      className={`w-2 h-2 rounded-full shrink-0 ${color}`}
      title={`${confidence} confidence match`}
    />
  );
}
