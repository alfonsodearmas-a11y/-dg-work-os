'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  X, ArrowLeft, ArrowRight, Upload, FileSpreadsheet, Download,
  Check, AlertCircle, AlertTriangle, Loader2, CheckCircle2,
} from 'lucide-react';
import { useDropZone } from '@/hooks/useDropZone';
import {
  parseSpreadsheet,
  autoMapColumns,
  transformRows,
  AIRSTRIP_TARGET_FIELDS,
  type AirstripColumnMapping,
  type AirstripTargetField,
  type ParseResult,
  type ParsedAirstripRow,
} from '@/lib/airstrip-upload-parser';
import { generateAirstripTemplate } from '@/lib/airstrip-template';
import { fmtFileSize } from '@/lib/format';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_EXTENSIONS = ['.xlsx', '.csv'];
const STEPS = ['Upload File', 'Map Columns', 'Preview & Import'] as const;

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function BulkUploadAirstripsModal({ open, onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Step state
  const [step, setStep] = useState<0 | 1 | 2>(0);

  // Step 1: File upload
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  // Step 2: Column mapping
  const [mappings, setMappings] = useState<AirstripColumnMapping[]>([]);

  // Step 3: Preview & Import
  const [validatedRows, setValidatedRows] = useState<ParsedAirstripRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    inserted: number; updated: number; skipped: number;
  } | null>(null);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setStep(0);
    setFile(null);
    setParseResult(null);
    setSelectedSheet('');
    setParseError(null);
    setParsing(false);
    setMappings([]);
    setValidatedRows([]);
    setImporting(false);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // ── File handling ──────────────────────────────────────────────────────────

  const processFile = useCallback((f: File, sheet?: string) => {
    setParseError(null);
    setParsing(true);
    (async () => {
      try {
        const ab = await f.arrayBuffer();
        const result = parseSpreadsheet(ab, sheet);
        if (result.rowCount === 0) {
          setParseError('No data rows found. Check that the first row contains headers.');
          setParsing(false);
          return;
        }
        setParseResult(result);
        setSelectedSheet(result.selectedSheet);
        setMappings(autoMapColumns(result.headers));
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse file');
      } finally {
        setParsing(false);
      }
    })();
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
      setParseError('Unsupported format. Please upload .xlsx or .csv files.');
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
    const data = generateAirstripTemplate();
    const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'airstrips_upload_template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── Column mapping ─────────────────────────────────────────────────────────

  const updateMapping = useCallback((index: number, targetField: AirstripTargetField | null) => {
    setMappings(prev => prev.map((m, i) =>
      i === index ? { ...m, targetField, confidence: 'high' as const } : m
    ));
  }, []);

  const usedTargets = useMemo(() => {
    const s = new Set<AirstripTargetField>();
    for (const m of mappings) {
      if (m.targetField) s.add(m.targetField);
    }
    return s;
  }, [mappings]);

  // ── Step transitions ───────────────────────────────────────────────────────

  const goToPreview = useCallback(() => {
    if (!parseResult) return;
    const rows = transformRows(parseResult.rows, mappings);
    setValidatedRows(rows);
    setStep(2);
  }, [parseResult, mappings]);

  // ── Import handler ─────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    const importable = validatedRows.filter(r => r.status !== 'error');
    if (importable.length === 0) return;

    setImporting(true);
    try {
      const res = await fetch('/api/airstrips/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: importable.map(r => ({
            name: r.name!,
            region: r.region!,
            engineered_structure: r.engineered_structure,
            runway_length_m: r.runway_length_m,
            runway_width_m: r.runway_width_m,
            surface_type: r.surface_type,
            surface_condition: r.surface_condition,
            last_inspection_date: r.last_inspection_date,
            flight_frequency: r.flight_frequency,
            airside_buildings: r.airside_buildings,
            remarks: r.remarks,
          })),
        }),
        signal: AbortSignal.timeout(60000),
      });

      const data = await res.json();
      if (!res.ok) {
        setParseError(data.error || 'Import failed');
        setImporting(false);
        return;
      }

      setImportResult({
        inserted: data.inserted,
        updated: data.updated,
        skipped: data.skipped,
      });
    } catch {
      setParseError('Import failed — please try again.');
    } finally {
      setImporting(false);
    }
  }, [validatedRows]);

  const handleDone = useCallback(() => {
    onImported();
    handleClose();
  }, [onImported, handleClose]);

  // ── Modal behavior ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, handleClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  // ── Validation state ───────────────────────────────────────────────────────

  const canProceedToMapping = !!parseResult && parseResult.rowCount > 0 && !parsing;
  const canProceedToPreview = usedTargets.has('name') && usedTargets.has('region');

  const counts = useMemo(() => {
    const c = { valid: 0, warnings: 0, errors: 0, importable: 0 };
    for (const r of validatedRows) {
      if (r.status === 'error') c.errors++;
      else if (r.status === 'warning') { c.warnings++; c.importable++; }
      else { c.valid++; c.importable++; }
    }
    return c;
  }, [validatedRows]);

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
        aria-labelledby="bulk-upload-airstrips-title"
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
                <h2 id="bulk-upload-airstrips-title" className="text-lg md:text-xl font-bold text-white">Bulk Upload</h2>
                <p className="text-slate-400 text-xs md:text-sm">Import airstrips from a spreadsheet</p>
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
              fileInputRef={fileInputRef}
              onFileInput={handleFileInput}
              onSheetChange={handleSheetChange}
              onDownloadTemplate={handleDownloadTemplate}
            />
          )}
          {step === 1 && parseResult && (
            <StepMapping
              mappings={mappings}
              usedTargets={usedTargets}
              rowCount={parseResult.rowCount}
              onUpdateMapping={updateMapping}
            />
          )}
          {step === 2 && (
            importResult ? (
              <StepResult
                result={importResult}
                errorCount={counts.errors}
                onDone={handleDone}
              />
            ) : (
              <StepPreview
                rows={validatedRows}
                counts={counts}
                importing={importing}
                parseError={parseError}
                onImport={handleImport}
              />
            )
          )}
        </div>

        {/* Footer */}
        {!importResult && !importing && (
          <div className="flex-shrink-0 border-t border-navy-800 px-4 md:px-6 py-3 md:py-4 bg-navy-900/50 flex items-center justify-between gap-3">
            <div>
              {step > 0 && (
                <button
                  onClick={() => setStep(s => (s === 2 ? 1 : 0) as 0 | 1)}
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
                  onClick={goToPreview}
                  disabled={!canProceedToPreview}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-gold-500 text-navy-950 hover:bg-[#e5c348] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Preview
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
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSheetChange: (sheet: string) => void;
  onDownloadTemplate: () => void;
}

function StepUpload({
  file, parseResult, parseError, parsing, isDragging, dropZoneProps,
  selectedSheet, fileInputRef, onFileInput, onSheetChange, onDownloadTemplate,
}: StepUploadProps) {
  const previewRows = parseResult?.rows.slice(0, 3) ?? [];
  const previewHeaders = parseResult?.headers.slice(0, 6) ?? [];

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
          accept=".xlsx,.csv"
          onChange={onFileInput}
          className="hidden"
        />
        {parsing ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 text-gold-500 animate-spin" />
            <p className="text-sm text-slate-400">Parsing file...</p>
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
              <p className="text-xs text-navy-600 mt-1">.xlsx, .csv &middot; Max 10 MB</p>
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
          <select
            value={selectedSheet}
            onChange={e => onSheetChange(e.target.value)}
            className="w-full bg-navy-900 border border-navy-800 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-gold-500/50 focus:border-gold-500/50 outline-none"
          >
            {parseResult.sheetNames.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
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
                  {previewHeaders.map(h => (
                    <th key={h} className="px-3 py-2 text-left text-navy-600 font-medium whitespace-nowrap">{h}</th>
                  ))}
                  {parseResult.headers.length > 6 && (
                    <th className="px-3 py-2 text-left text-navy-600 font-medium">+{parseResult.headers.length - 6} more</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/50">
                {previewRows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-navy-900/50">
                    {previewHeaders.map(h => (
                      <td key={h} className="px-3 py-1.5 text-slate-300 whitespace-nowrap max-w-[200px] truncate">{row[h] || '—'}</td>
                    ))}
                    {parseResult.headers.length > 6 && <td className="px-3 py-1.5 text-navy-600">…</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Download template */}
      <button
        onClick={e => { e.stopPropagation(); onDownloadTemplate(); }}
        className="flex items-center gap-1.5 text-xs text-gold-500 hover:text-gold-400 transition-colors"
      >
        <Download size={14} />
        Download blank template
      </button>
    </div>
  );
}

// ── Step 2: Column Mapping ───────────────────────────────────────────────────

interface StepMappingProps {
  mappings: AirstripColumnMapping[];
  usedTargets: Set<AirstripTargetField>;
  rowCount: number;
  onUpdateMapping: (index: number, targetField: AirstripTargetField | null) => void;
}

function StepMapping({ mappings, usedTargets, rowCount, onUpdateMapping }: StepMappingProps) {
  return (
    <div className="space-y-5">
      {(!usedTargets.has('name') || !usedTargets.has('region')) && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-gold-500/10 border border-gold-500/20">
          <AlertCircle className="h-4 w-4 text-gold-500 mt-0.5 shrink-0" />
          <p className="text-sm text-gold-400">
            Map at least <strong>Airstrip Name</strong> and <strong>Region</strong> to proceed.
          </p>
        </div>
      )}

      <div>
        <p className="text-xs text-slate-400 mb-3">Map each spreadsheet column to an airstrip field</p>
        <div className="space-y-2">
          {mappings.map((m, i) => (
            <div key={m.sourceHeader} className="flex items-center gap-3 bg-navy-900/50 rounded-lg px-3 py-2.5 border border-navy-800/50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      m.confidence === 'high' ? 'bg-emerald-400' :
                      m.confidence === 'medium' ? 'bg-amber-400' : 'bg-navy-600'
                    }`}
                    title={`${m.confidence} confidence match`}
                  />
                  <span className="text-sm text-white truncate">{m.sourceHeader}</span>
                </div>
              </div>

              <ArrowRight size={14} className="text-navy-600 shrink-0" />

              <div className="flex-1 min-w-0">
                <select
                  value={m.targetField ?? '__skip__'}
                  onChange={e => onUpdateMapping(i, e.target.value === '__skip__' ? null : e.target.value as AirstripTargetField)}
                  className="w-full bg-navy-950 border border-navy-800 rounded-lg px-3 py-1.5 text-sm text-white focus:ring-1 focus:ring-gold-500/50 focus:border-gold-500/50 outline-none"
                >
                  <option value="__skip__">Skip</option>
                  {AIRSTRIP_TARGET_FIELDS.map(tf => (
                    <option
                      key={tf.value}
                      value={tf.value}
                      disabled={usedTargets.has(tf.value) && m.targetField !== tf.value}
                    >
                      {tf.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center pt-2">
        <span className="text-white font-medium">{rowCount}</span> rows will be validated
      </p>
    </div>
  );
}

// ── Step 3: Preview & Import ─────────────────────────────────────────────────

interface StepPreviewProps {
  rows: ParsedAirstripRow[];
  counts: { valid: number; warnings: number; errors: number; importable: number };
  importing: boolean;
  parseError: string | null;
  onImport: () => void;
}

function StepPreview({ rows, counts, importing, parseError, onImport }: StepPreviewProps) {
  return (
    <div className="space-y-4">
      {/* Summary badges */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
          <Check size={12} /> {counts.valid} valid
        </span>
        {counts.warnings > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <AlertTriangle size={12} /> {counts.warnings} warnings
          </span>
        )}
        {counts.errors > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-500/10 border border-red-500/30 text-red-400">
            <AlertCircle size={12} /> {counts.errors} errors
          </span>
        )}
      </div>

      {/* Error */}
      {parseError && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400">{parseError}</p>
        </div>
      )}

      {/* Preview table */}
      <div className="overflow-x-auto rounded-lg border border-navy-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-navy-900">
              <th className="px-2 py-2 text-left text-navy-600 font-medium w-10">Row</th>
              <th className="px-2 py-2 text-left text-navy-600 font-medium">Name</th>
              <th className="px-2 py-2 text-center text-navy-600 font-medium w-14">Reg.</th>
              <th className="px-2 py-2 text-center text-navy-600 font-medium w-14">Eng.</th>
              <th className="px-2 py-2 text-right text-navy-600 font-medium w-20">Length</th>
              <th className="px-2 py-2 text-right text-navy-600 font-medium w-20">Width</th>
              <th className="px-2 py-2 text-left text-navy-600 font-medium">Surface</th>
              <th className="px-2 py-2 text-left text-navy-600 font-medium">Condition</th>
              <th className="px-2 py-2 text-left text-navy-600 font-medium whitespace-nowrap">Inspection</th>
              <th className="px-2 py-2 text-left text-navy-600 font-medium whitespace-nowrap">Freq.</th>
              <th className="px-2 py-2 text-center text-navy-600 font-medium w-16">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800/50">
            {rows.map(r => {
              const bgClass = r.status === 'error'
                ? 'bg-red-500/5'
                : r.status === 'warning'
                  ? 'bg-amber-500/5'
                  : '';
              return (
                <tr key={r.rowIndex} className={`hover:bg-navy-900/50 ${bgClass}`} title={r.issues.length > 0 ? r.issues.join('; ') : undefined}>
                  <td className="px-2 py-1.5 text-navy-600">{r.rowIndex}</td>
                  <td className="px-2 py-1.5 text-white font-medium max-w-[160px] truncate">{r.name || '—'}</td>
                  <td className="px-2 py-1.5 text-center text-slate-300">{r.region ?? '—'}</td>
                  <td className="px-2 py-1.5 text-center">{r.engineered_structure ? <Check size={12} className="text-emerald-400 mx-auto" /> : '—'}</td>
                  <td className="px-2 py-1.5 text-right text-slate-300 font-mono">{r.runway_length_m ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right text-slate-300 font-mono">{r.runway_width_m ?? '—'}</td>
                  <td className="px-2 py-1.5 text-slate-400 max-w-[100px] truncate">{r.surface_type || '—'}</td>
                  <td className="px-2 py-1.5 text-slate-400">{r.surface_condition || '—'}</td>
                  <td className="px-2 py-1.5 text-slate-400">{r.last_inspection_date || '—'}</td>
                  <td className="px-2 py-1.5 text-slate-400">{r.flight_frequency || '—'}</td>
                  <td className="px-2 py-1.5 text-center">
                    {r.status === 'error' && (
                      <span className="inline-flex items-center gap-0.5 text-red-400" title={r.issues.join('; ')}>
                        <AlertCircle size={12} /> Error
                      </span>
                    )}
                    {r.status === 'warning' && (
                      <span className="inline-flex items-center gap-0.5 text-amber-400" title={r.issues.join('; ')}>
                        <AlertTriangle size={12} /> Warn
                      </span>
                    )}
                    {r.status === 'valid' && (
                      <span className="text-emerald-400"><Check size={12} className="mx-auto" /></span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Import button */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={onImport}
          disabled={counts.importable === 0 || importing}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-gold-500 text-navy-950 hover:bg-[#e5c348] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {importing && <Loader2 size={16} className="animate-spin" />}
          {importing ? 'Importing...' : `Import ${counts.importable} Airstrip${counts.importable !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

// ── Step 3b: Result Summary ──────────────────────────────────────────────────

interface StepResultProps {
  result: { inserted: number; updated: number; skipped: number };
  errorCount: number;
  onDone: () => void;
}

function StepResult({ result, errorCount, onDone }: StepResultProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-6">
      <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-400" />
      </div>

      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold text-white">Import Complete</h3>
        <div className="space-y-1 text-sm">
          {result.inserted > 0 && (
            <p className="text-emerald-400">{result.inserted} airstrip{result.inserted !== 1 ? 's' : ''} inserted (new)</p>
          )}
          {result.updated > 0 && (
            <p className="text-blue-400">{result.updated} airstrip{result.updated !== 1 ? 's' : ''} updated (existing)</p>
          )}
          {(result.skipped > 0 || errorCount > 0) && (
            <p className="text-red-400">{result.skipped + errorCount} row{(result.skipped + errorCount) !== 1 ? 's' : ''} skipped (errors)</p>
          )}
        </div>
      </div>

      <button
        onClick={onDone}
        className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-gold-500 text-navy-950 hover:bg-[#e5c348] transition-colors"
      >
        Done
      </button>
    </div>
  );
}
