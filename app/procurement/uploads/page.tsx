'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, CheckCircle2, XCircle, AlertTriangle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface PreviewOutcome {
  upload_id: string;
  parse_stats: Record<string, number>;
  match_stats: Record<string, number>;
  new_tenders: Array<Record<string, unknown>>;
  updated_tenders: Array<{ existing_tender_id: string; incoming: Record<string, unknown>; field_diffs: Array<{ field: string; old: unknown; new: unknown }>; score: number }>;
  review_items: Array<{ id: string; incoming: Record<string, unknown>; candidates: Array<{ tender_id: string; score: number; description: string }> }>;
  missing_tenders: Array<{ id: string; description: string; agency: string }>;
}

interface UploadRow {
  id: string;
  filename: string;
  uploaded_at: string;
  status: string;
  stats: Record<string, number>;
  uploader?: { name: string } | { name: string }[];
}

function Stat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'warn' | 'danger' | 'success' }) {
  const color = tone === 'warn' ? 'text-amber-300' : tone === 'danger' ? 'text-red-400' : tone === 'success' ? 'text-emerald-400' : 'text-white';
  return (
    <div className="bg-navy-900 rounded-xl border border-navy-800 p-3">
      <div className="text-navy-600 text-xs mb-1">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

export default function UploadsPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PreviewOutcome | null>(null);
  const [applying, setApplying] = useState(false);
  const [history, setHistory] = useState<UploadRow[]>([]);

  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/procurement/uploads');
    if (res.ok) {
      const data = await res.json();
      setHistory(data.uploads || []);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    setPreview(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/procurement/uploads', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Failed to preview upload');
        return;
      }
      const outcome = await res.json() as PreviewOutcome;
      setPreview(outcome);
      toast.success(`Preview ready: ${outcome.match_stats.new} new, ${outcome.match_stats.updated} updated, ${outcome.match_stats.review_queue} need review`);
      loadHistory();
    } catch {
      toast.error('Network error');
    } finally {
      setUploading(false);
    }
  }, [toast, loadHistory]);

  const handleApply = async () => {
    if (!preview) return;
    setApplying(true);
    try {
      const res = await fetch('/api/procurement/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: preview.upload_id, action: 'apply' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Failed to apply upload');
        return;
      }
      const { stats } = await res.json();
      toast.success(`Applied: ${stats.new} new, ${stats.updated} updated, ${stats.review_queue} in review, ${stats.missing} missing`);
      setPreview(null);
      loadHistory();
    } catch {
      toast.error('Network error');
    } finally {
      setApplying(false);
    }
  };

  const handleCancel = async () => {
    if (!preview) return;
    try {
      await fetch('/api/procurement/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: preview.upload_id, action: 'cancel' }),
      });
      toast.success('Upload cancelled');
      setPreview(null);
      loadHistory();
    } catch {
      toast.error('Network error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/procurement" className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg md:text-xl font-bold text-white">Upload PSIP Monitoring Form</h1>
          <p className="text-xs md:text-sm text-navy-600">Preview → review → apply. Every upload is archived and diffed against the existing tender set.</p>
        </div>
      </div>

      {!preview && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
            className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
              dragging ? 'border-gold-500/50 bg-gold-500/5' : 'border-navy-800 bg-navy-900/40'
            }`}
          >
            <div className="mx-auto w-14 h-14 rounded-2xl bg-navy-800 flex items-center justify-center mb-3">
              {uploading ? <Loader2 className="h-6 w-6 text-gold-500 animate-spin" /> : <Upload className="h-6 w-6 text-gold-500" />}
            </div>
            <p className="text-sm text-white font-semibold">Drop the PSIP xlsx here</p>
            <p className="text-xs text-navy-600 mt-1">…or click below. Must contain the “PSIP Monitoring Form” sheet.</p>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="mt-4 px-4 py-2 rounded-lg bg-gold-500 text-navy-950 text-sm font-semibold disabled:opacity-50">
              {uploading ? 'Parsing…' : 'Choose file'}
            </button>
          </div>

          {/* Recent uploads */}
          {history.length > 0 && (
            <div className="rounded-xl border border-navy-800 bg-navy-900/40">
              <div className="px-4 py-3 border-b border-navy-800 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-navy-600" />
                <h3 className="text-sm font-semibold text-white">Recent uploads</h3>
              </div>
              <div className="divide-y divide-navy-800/50">
                {history.slice(0, 10).map((h) => {
                  const uploader = (Array.isArray(h.uploader) ? h.uploader[0] : h.uploader)?.name || 'Unknown';
                  const toneColor = h.status === 'applied' ? 'text-emerald-400' : h.status === 'cancelled' ? 'text-slate-400' : 'text-amber-400';
                  return (
                    <Link href={`/procurement/uploads/${h.id}`} key={h.id} className="flex items-center gap-3 px-4 py-3 hover:bg-navy-800/40 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{h.filename}</p>
                        <p className="text-xs text-navy-600">{new Date(h.uploaded_at).toLocaleString()} · {uploader}</p>
                      </div>
                      <span className={`text-xs font-medium uppercase ${toneColor}`}>{h.status}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-base font-semibold text-white">Preview</h2>
            <div className="flex items-center gap-2">
              <button onClick={handleCancel} disabled={applying} className="px-3 py-2 rounded-lg text-xs font-medium text-slate-400 border border-navy-800 hover:border-red-500/40 hover:text-red-400 transition-colors">
                Cancel
              </button>
              <button onClick={handleApply} disabled={applying} className="px-4 py-2 rounded-lg text-xs font-semibold bg-gold-500 text-navy-950 hover:bg-[#e5c348] disabled:opacity-50 flex items-center gap-2">
                {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {applying ? 'Applying…' : 'Apply upload'}
              </button>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <Stat label="New" value={preview.match_stats.new} tone="success" />
            <Stat label="Updated" value={preview.match_stats.updated} />
            <Stat label="Review" value={preview.match_stats.review_queue} tone="warn" />
            <Stat label="Missing" value={preview.match_stats.missing} tone="danger" />
            <Stat label="Field changes" value={preview.match_stats.updated_field_changes} />
            <Stat label="Inferred stages" value={preview.parse_stats.stages_inferred_from_dates ?? 0} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-navy-600">
            <div>Excluded (Lethem/HECI): {preview.parse_stats.excluded_lethem_heci}</div>
            <div>Programme-344 dupes: {preview.parse_stats.programme_header_dupes}</div>
            <div>Skipped `Nil` method: {preview.parse_stats.skipped_nil_method}</div>
            <div>`Public Tender` → Open: {preview.parse_stats.normalized_public_tender}</div>
          </div>

          {/* New tenders */}
          <section className="rounded-xl border border-navy-800">
            <header className="px-4 py-3 border-b border-navy-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">New tenders ({preview.new_tenders.length})</h3>
            </header>
            <div className="max-h-72 overflow-auto divide-y divide-navy-800/50">
              {preview.new_tenders.slice(0, 20).map((t, i) => (
                <div key={i} className="px-4 py-2.5 text-xs">
                  <div className="text-white">{String(t.description)}</div>
                  <div className="text-navy-600">{String(t.agency)} · {String(t.stage)} {t.is_rollover ? '· Rollover' : ''} {t.has_exception ? '· See Remarks' : ''}</div>
                </div>
              ))}
              {preview.new_tenders.length > 20 && <div className="px-4 py-2 text-xs text-navy-600">…and {preview.new_tenders.length - 20} more</div>}
              {preview.new_tenders.length === 0 && <div className="px-4 py-4 text-xs text-navy-600">No new tenders.</div>}
            </div>
          </section>

          {/* Updated tenders */}
          <section className="rounded-xl border border-navy-800">
            <header className="px-4 py-3 border-b border-navy-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Updated tenders ({preview.updated_tenders.length})</h3>
            </header>
            <div className="max-h-72 overflow-auto divide-y divide-navy-800/50">
              {preview.updated_tenders.slice(0, 20).map((u, i) => (
                <div key={i} className="px-4 py-2.5 text-xs">
                  <div className="text-white">{String(u.incoming.description)}</div>
                  <div className="text-navy-600 mt-0.5">
                    {u.field_diffs && u.field_diffs.length > 0 ? u.field_diffs.map((d) => `${d.field}: ${String(d.old ?? '—')} → ${String(d.new ?? '—')}`).join(' · ') : '(no field changes)'}
                  </div>
                </div>
              ))}
              {preview.updated_tenders.length > 20 && <div className="px-4 py-2 text-xs text-navy-600">…and {preview.updated_tenders.length - 20} more</div>}
              {preview.updated_tenders.length === 0 && <div className="px-4 py-4 text-xs text-navy-600">No updates.</div>}
            </div>
          </section>

          {/* Review queue */}
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/5">
            <header className="px-4 py-3 border-b border-amber-500/20 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-white">Needs review ({preview.review_items.length})</h3>
            </header>
            <div className="max-h-60 overflow-auto divide-y divide-amber-500/20">
              {preview.review_items.map((r, i) => (
                <div key={i} className="px-4 py-2.5 text-xs">
                  <div className="text-white">{String(r.incoming.description)}</div>
                  <div className="text-navy-600 mt-0.5">
                    {(r.candidates || []).slice(0, 3).map((c) => `${c.description.slice(0, 60)} (${c.score.toFixed(2)})`).join(' · ')}
                  </div>
                </div>
              ))}
              {preview.review_items.length === 0 && <div className="px-4 py-4 text-xs text-navy-600">No ambiguous matches.</div>}
            </div>
          </section>

          {/* Missing */}
          <section className="rounded-xl border border-red-500/30 bg-red-500/5">
            <header className="px-4 py-3 border-b border-red-500/20 flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-400" />
              <h3 className="text-sm font-semibold text-white">Missing tenders ({preview.missing_tenders.length})</h3>
            </header>
            <div className="max-h-60 overflow-auto divide-y divide-red-500/20">
              {preview.missing_tenders.slice(0, 20).map((t) => (
                <div key={t.id} className="px-4 py-2.5 text-xs">
                  <div className="text-white">{t.description}</div>
                  <div className="text-navy-600 mt-0.5">{t.agency}</div>
                </div>
              ))}
              {preview.missing_tenders.length === 0 && <div className="px-4 py-4 text-xs text-navy-600">All tenders accounted for.</div>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
