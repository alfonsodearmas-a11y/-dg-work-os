'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Upload, FileSpreadsheet, Link as LinkIcon, Inbox, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useDropZone } from '@/hooks/useDropZone';
import { STAGE_CONFIG, type ProcurementStage } from '@/lib/procurement-types';
import { PsipRefBadge } from './PsipRefBadge';

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls'];

const FIELD_LABEL: Record<string, string> = {
  current_stage: 'Stage',
  date_first_advertised: 'Tender advertised',
  tender_closing_date: 'Tender closed',
  date_eval_submitted_mtb: 'Eval submitted (MTB)',
  date_eval_submitted_nptab: 'Eval submitted (NPTAB)',
  date_of_award: 'Date of award',
  psip_remarks: 'Remarks',
};

interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

interface RecordDiff {
  package_id: string;
  psip_ref: string;
  title: string;
  changes: FieldChange[];
  unmapped_status?: string;
}

interface SyncDiff {
  changes: RecordDiff[];
  unmatched_sheet_refs: string[];
  db_missing_from_sheet: { package_id: string; psip_ref: string; title: string }[];
}

function formatValue(field: string, value: string | null): string {
  if (value == null || value === '') return '—';
  if (field === 'current_stage') {
    return STAGE_CONFIG[value as ProcurementStage]?.label ?? value;
  }
  return value;
}

export function PsipSyncDiff() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<SyncDiff | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    setDiff(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/procurement/psip/upload', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to parse file');
        return;
      }
      const newDiff = data.diff as SyncDiff;
      setDiff(newDiff);
      setUploadedFileName(data.file_name ?? file.name);
      const initialSelected: Record<string, boolean> = {};
      for (const c of newDiff.changes) {
        initialSelected[c.package_id] = c.changes.length > 0;
      }
      setSelected(initialSelected);
    } catch {
      setError('Network error while uploading');
    } finally {
      setUploading(false);
    }
  }

  function resetUpload() {
    setDiff(null);
    setError(null);
    setSelected({});
    setUploadedFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const { isDragging, dropZoneProps } = useDropZone({
    accept: ACCEPTED_EXTENSIONS,
    onFileDrop: (files) => {
      if (files[0]) uploadFile(files[0]);
    },
  });

  const selectedCount = Object.values(selected).filter(Boolean).length;

  async function handleApply() {
    if (!diff || selectedCount === 0) return;
    setApplying(true);
    try {
      const approvedChanges = diff.changes.filter(
        (c) => selected[c.package_id] && c.changes.length > 0,
      );
      const res = await fetch('/api/procurement/psip/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedChanges }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to apply changes');
        return;
      }
      const failed = (data.failed ?? []) as unknown[];
      if (failed.length > 0) {
        toast.warning(`${data.applied_count} applied, ${failed.length} failed`);
      } else {
        toast.success(`${data.applied_count} changes applied`);
      }
      router.push('/procurement');
    } catch {
      toast.error('Network error');
    } finally {
      setApplying(false);
    }
  }

  // ── Dropzone (shown until a file is uploaded) ────────────────────────
  if (!diff) {
    return (
      <div className="space-y-4">
        <div
          {...dropZoneProps}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-gold-500/60 bg-gold-500/5'
              : 'border-navy-800 bg-navy-900/40 hover:border-gold-500/40'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file);
            }}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Spinner />
              <p className="text-sm text-navy-600">Parsing file…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-gold-500/15 flex items-center justify-center">
                <Upload className="h-6 w-6 text-gold-500" />
              </div>
              <div>
                <p className="text-white font-semibold">Drop the PSIP Excel file here</p>
                <p className="text-xs text-navy-600 mt-1">
                  or click to select — .xlsx downloaded from the PSIP sheet
                </p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-semibold mb-1">Could not parse file</p>
                <p className="text-xs text-red-300">{error}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const nothingToShow =
    diff.changes.length === 0 &&
    diff.unmatched_sheet_refs.length === 0 &&
    diff.db_missing_from_sheet.length === 0;

  if (nothingToShow) {
    return (
      <div className="bg-navy-900 rounded-xl border border-navy-800 p-10 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
        <h3 className="text-white text-lg font-semibold mb-1">Everything in sync</h3>
        <p className="text-sm text-navy-600">
          All GWI procurement records with a PSIP ref already match the uploaded file.
        </p>
        <button
          onClick={resetUpload}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white bg-navy-800 hover:bg-navy-700 transition-colors"
        >
          <Upload className="h-4 w-4" /> Upload another file
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-navy-800 bg-navy-900/40 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <FileSpreadsheet className="h-4 w-4 text-gold-500 shrink-0" />
          <span className="text-sm text-white truncate">{uploadedFileName ?? 'Uploaded file'}</span>
        </div>
        <button
          onClick={resetUpload}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-navy-600 hover:text-gold-500 transition-colors shrink-0"
        >
          <X className="h-3.5 w-3.5" />
          Change file
        </button>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
          Changes to apply
          <span className="ml-2 text-navy-600 normal-case tracking-normal">
            {selectedCount} of {diff.changes.length} selected
          </span>
        </h3>

        {diff.changes.length === 0 ? (
          <p className="text-sm text-navy-600">No field changes to apply.</p>
        ) : (
          <div className="space-y-3">
            {diff.changes.map((record) => (
              <div
                key={record.package_id}
                className="rounded-xl border border-navy-800 bg-gradient-to-b from-[#1a2744] to-[#0f1d32] p-4"
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!selected[record.package_id]}
                    onChange={(e) =>
                      setSelected((s) => ({ ...s, [record.package_id]: e.target.checked }))
                    }
                    disabled={record.changes.length === 0}
                    className="mt-1 h-4 w-4 accent-gold-500 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-2">
                      <PsipRefBadge psipRef={record.psip_ref} size="sm" />
                      <span className="text-sm font-medium text-white truncate">{record.title}</span>
                    </div>

                    {record.unmapped_status && (
                      <div className="flex items-center gap-2 mb-2 text-xs text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Unmapped sheet status:{' '}
                        <span className="font-semibold">&ldquo;{record.unmapped_status}&rdquo;</span>
                        &nbsp;&mdash; stage unchanged
                      </div>
                    )}

                    {record.changes.length > 0 ? (
                      <div className="space-y-1">
                        {record.changes.map((c, i) => (
                          <div key={i} className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2 text-xs">
                            <span className="text-navy-600 font-medium">
                              {FIELD_LABEL[c.field] ?? c.field}
                            </span>
                            <span className="text-slate-400 truncate" title={formatValue(c.field, c.before)}>
                              {formatValue(c.field, c.before)}
                            </span>
                            <span className="text-navy-600">→</span>
                            <span className="text-white truncate" title={formatValue(c.field, c.after)}>
                              {formatValue(c.field, c.after)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-navy-600">No field changes.</p>
                    )}
                  </div>
                </label>
              </div>
            ))}
          </div>
        )}
      </section>

      {diff.unmatched_sheet_refs.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-navy-600" />
            PSIP refs in the file with no matching DG-OS record
          </h3>
          <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-4">
            <p className="text-xs text-navy-600 mb-2">
              Add the matching PSIP ref on the corresponding procurement record to include it in the next sync.
            </p>
            <div className="flex flex-wrap gap-2">
              {diff.unmatched_sheet_refs.map((ref) => (
                <span
                  key={ref}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-navy-800 text-slate-400 border border-navy-700"
                >
                  {ref}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {diff.db_missing_from_sheet.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
            <Inbox className="h-4 w-4 text-navy-600" />
            DG-OS records not found in this file
          </h3>
          <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-4 space-y-1.5">
            {diff.db_missing_from_sheet.map((r) => (
              <div key={r.package_id} className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-navy-800 text-slate-400 border border-navy-700">
                  {r.psip_ref}
                </span>
                <span className="text-slate-400 truncate">{r.title}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {diff.changes.length > 0 && (
        <div className="sticky bottom-4 flex justify-end">
          <button
            onClick={handleApply}
            disabled={applying || selectedCount === 0}
            className="btn-gold flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {applying ? (
              <Spinner size="sm" className="border-navy-950 border-t-transparent" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {applying ? 'Applying…' : `Apply ${selectedCount} change${selectedCount === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  );
}
