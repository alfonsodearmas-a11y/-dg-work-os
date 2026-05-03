'use client';

import { useState, useCallback } from 'react';
import {
  X, Upload, FileSpreadsheet, Check, AlertCircle, Loader2,
  ArrowRight, ChevronDown, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { DropZone } from '@/components/ui/DropZone';
import { useToast } from '@/components/ui/Toast';
import { parseDelayedProjectsFile, type ParsedUploadResult } from '@/lib/delayed-projects/upload-parser';
import { validateRows, type ValidationResult } from '@/lib/delayed-projects/row-validator';
import type { UploadResult } from '@/lib/delayed-projects/types';
import { fmtCurrency, fmtDate } from '@/components/oversight/types';
import { AgencyBadge } from './shared';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/csv': ['.csv'],
};

export function UploadModal({ isOpen, onClose, onUploaded }: UploadModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<0 | 1>(0);
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParsedUploadResult | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);

  const reset = useCallback(() => {
    setStep(0);
    setFile(null);
    setParseResult(null);
    setValidation(null);
    setUploading(false);
    setUploadResult(null);
    setShowWarnings(false);
    setShowBlocked(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleFileDrop = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);

    try {
      const buffer = await f.arrayBuffer();
      const result = parseDelayedProjectsFile(buffer);
      setParseResult(result);

      const validated = validateRows(result.rows);
      setValidation(validated);
      setStep(1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse file';
      toast.error(msg);
    }
  }, [toast]);

  const handleUpload = useCallback(async () => {
    if (!validation) return;

    const importable = validation.rows.filter((r) => r.status !== 'blocked').map((r) => r.data);
    if (importable.length === 0) {
      toast.error('No valid rows to upload');
      return;
    }

    setUploading(true);
    try {
      const res = await fetch('/api/delayed-projects/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: importable }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }

      const result: UploadResult = await res.json();
      setUploadResult(result);
      toast.success(`Upload complete: ${result.inserted} new, ${result.updated} updated`);
      onUploaded();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }, [validation, toast, onUploaded]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-navy-900 border border-navy-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gold-500/20 flex items-center justify-center">
              <Upload className="w-[18px] h-[18px] text-gold-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Upload Project Data</h2>
              <p className="text-xs text-navy-600">
                {step === 0 ? 'Select a spreadsheet file' : uploadResult ? 'Upload complete' : 'Review and confirm'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="text-navy-600 hover:text-white transition-colors" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Step 0: File Selection */}
          {step === 0 && (
            <DropZone
              onDrop={handleFileDrop}
              accept={ACCEPTED}
              maxSize={MAX_FILE_SIZE}
              label="Drop spreadsheet here or click to upload (.xlsx, .csv)"
            />
          )}

          {/* Step 1: Validation + Upload */}
          {step === 1 && !uploadResult && validation && parseResult && (
            <>
              {/* File info */}
              <div className="flex items-center gap-3 p-3 bg-navy-950/60 rounded-lg border border-navy-800">
                <FileSpreadsheet className="h-5 w-5 text-gold-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{file?.name}</p>
                  <p className="text-xs text-navy-600">{parseResult.rows.length} rows parsed</p>
                </div>
                <button onClick={reset} className="text-xs text-navy-600 hover:text-white">Change file</button>
              </div>

              {parseResult.missingRequiredFields.length > 0 ? (
                /* Header mismatch — short-circuit the row-level summary entirely. */
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-300">Your file is missing a required column</p>
                      <p className="text-xs text-red-300/80 mt-1">
                        We could not find a column for{' '}
                        <span className="font-mono">
                          {parseResult.missingRequiredFields.join(', ')}
                        </span>
                        . Rename the matching column in your spreadsheet, or re-export from oversight.gov.gy.
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-red-300/70 font-medium mb-1">Headers found in your file:</p>
                    <div className="flex flex-wrap gap-1">
                      {parseResult.headers.length > 0 ? (
                        parseResult.headers.map((h) => (
                          <span key={h} className="px-2 py-0.5 rounded text-xs font-mono bg-navy-950/60 text-red-200/80 border border-red-500/20">
                            {h}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-red-300/60">(none)</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Parse warnings (non-header issues only — header issues handled above). */}
                  {parseResult.warnings.length > 0 && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <p className="text-xs text-amber-400 font-medium mb-1">Parse warnings ({parseResult.warnings.length})</p>
                      <ul className="text-xs text-amber-300/70 space-y-0.5 max-h-20 overflow-y-auto">
                        {parseResult.warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}
                        {parseResult.warnings.length > 10 && <li>...and {parseResult.warnings.length - 10} more</li>}
                      </ul>
                    </div>
                  )}

                  {/* Agency-fallback notice — when no executing_agency column was mapped. */}
                  {parseResult.executingAgencyDefaulted && parseResult.executingAgencyDefaultedCount > 0 && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-300/80">
                        Agency defaulted to <span className="font-mono">MOPUA</span> for{' '}
                        <span className="font-semibold">{parseResult.executingAgencyDefaultedCount}</span> row
                        {parseResult.executingAgencyDefaultedCount === 1 ? '' : 's'} because no
                        <span className="font-mono"> executing_agency</span> column was mapped. If your
                        spreadsheet has agency data in a different column, rename it before re-uploading.
                      </p>
                    </div>
                  )}

                  {/* Validation summary */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-center">
                      <p className="text-lg font-bold text-emerald-400">{validation.valid}</p>
                      <p className="text-xs text-emerald-400/70">Valid</p>
                    </div>
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-center">
                      <p className="text-lg font-bold text-amber-400">{validation.warnings}</p>
                      <p className="text-xs text-amber-400/70">Warnings</p>
                    </div>
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
                      <p className="text-lg font-bold text-red-400">{validation.blocked}</p>
                      <p className="text-xs text-red-400/70">Blocked</p>
                    </div>
                  </div>
                </>
              )}

              {/* Warning rows */}
              {parseResult.missingRequiredFields.length === 0 && validation.warnings > 0 && (
                <div>
                  <button
                    onClick={() => setShowWarnings(!showWarnings)}
                    className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
                  >
                    {showWarnings ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Show warning rows
                  </button>
                  {showWarnings && (
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {validation.rows.filter((r) => r.status === 'warning').map((r) => (
                        <div key={r.rowIndex} className="text-xs text-amber-300/70 px-2 py-1 bg-navy-950/40 rounded">
                          <span className="text-amber-400 font-medium">{r.data.project_reference}:</span>{' '}
                          {r.issues.join(', ')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Blocked rows */}
              {parseResult.missingRequiredFields.length === 0 && validation.blocked > 0 && (
                <div>
                  <button
                    onClick={() => setShowBlocked(!showBlocked)}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                  >
                    {showBlocked ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Show blocked rows ({validation.blocked})
                  </button>
                  {showBlocked && (
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {validation.rows.filter((r) => r.status === 'blocked').map((r) => (
                        <div key={r.rowIndex} className="text-xs text-red-300/70 px-2 py-1 bg-navy-950/40 rounded">
                          Row {r.rowIndex + 2}: {r.issues.join(', ')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Upload result */}
          {uploadResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <Check className="h-6 w-6 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-white">Upload Complete</p>
                  <p className="text-xs text-emerald-300/70">
                    {uploadResult.inserted} new &middot; {uploadResult.updated} updated &middot; {uploadResult.unchanged} unchanged
                  </p>
                </div>
              </div>

              {/* Not in upload */}
              {uploadResult.not_in_upload.length > 0 && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <p className="text-sm font-medium text-amber-400">
                      {uploadResult.not_in_upload.length} projects not in this upload
                    </p>
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {uploadResult.not_in_upload.map((p) => (
                      <div key={p.project_reference} className="flex items-center gap-2 text-xs text-amber-300/70">
                        <AgencyBadge agency={p.sub_agency} />
                        <span className="truncate">{p.project_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Biggest deltas */}
              {uploadResult.biggest_deltas.length > 0 && (
                <div className="p-4 bg-navy-950/60 border border-navy-800 rounded-xl">
                  <p className="text-sm font-medium text-white mb-2">Biggest Changes</p>
                  <div className="space-y-1.5">
                    {uploadResult.biggest_deltas.slice(0, 5).map((d) => (
                      <div key={d.project_id} className="flex items-center gap-2 text-xs">
                        <AgencyBadge agency={d.sub_agency} />
                        <span className="text-white truncate flex-1">{d.project_name}</span>
                        <span className="text-slate-400">{d.previous_pct}%</span>
                        <ArrowRight className="h-3 w-3 text-navy-600" />
                        <span className="text-white font-medium">{d.current_pct}%</span>
                        <span className={`font-medium ${d.delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          ({d.delta > 0 ? '+' : ''}{d.delta.toFixed(1)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-navy-800 flex items-center justify-end gap-3">
          {uploadResult ? (
            <button onClick={handleClose} className="btn-gold px-4 py-2 text-sm">
              Done
            </button>
          ) : step === 1 ? (
            <>
              <button onClick={reset} className="btn-navy px-4 py-2 text-sm">Back</button>
              <button
                onClick={handleUpload}
                disabled={
                  uploading ||
                  !validation ||
                  (parseResult?.missingRequiredFields.length ?? 0) > 0 ||
                  validation.valid + validation.warnings === 0
                }
                className="btn-gold px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {uploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
                ) : (
                  <><Upload className="h-4 w-4" /> Upload {(validation?.valid || 0) + (validation?.warnings || 0)} rows</>
                )}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
