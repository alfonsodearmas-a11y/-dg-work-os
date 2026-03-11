'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

interface UploadPanelProps {
  onSuccess?: () => void;
  lockedAgency?: 'GPL' | 'GWI';
}

interface UploadResult {
  agency: string;
  recordCount: number;
  dataAsOf: string;
  sheetName: string;
  breakdown: Record<string, number>;
  warnings: string[];
}

type Phase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export function UploadPanel({ onSuccess, lockedAgency }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [agencyOverride, setAgencyOverride] = useState<'' | 'GPL' | 'GWI'>('');
  const abortRef = useRef<AbortController | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) selectFile(droppedFile);
  }, []);

  const selectFile = (f: File) => {
    setError(null);
    setResult(null);
    setPhase('idle');
    const name = f.name.toLowerCase();
    if (!name.endsWith('.xls') && !name.endsWith('.xlsx')) {
      setError('Invalid file type. Only .xls and .xlsx files are accepted.');
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError('File too large. Maximum 10MB.');
      return;
    }
    setFile(f);
  };

  /** Fetch with retry + exponential backoff for transient errors */
  async function fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = MAX_RETRIES
  ): Promise<Response> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await fetch(url, options);
      // Retry on 502/503/504 (gateway/timeout errors), not on 4xx
      if (res.ok || res.status < 500 || res.status === 500 || attempt === retries) {
        return res;
      }
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * Math.pow(2, attempt)));
    }
    // Unreachable, but TypeScript needs it
    throw new Error('Retry limit exceeded');
  }

  /** Parse JSON response, handling non-JSON (HTML error pages from gateway) */
  async function parseResponse(res: Response): Promise<{ ok: boolean; data: Record<string, unknown>; status: number }> {
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const errorMsg = res.status === 504
        ? 'Server timed out processing the request. Please try again.'
        : res.status === 502
        ? 'Server temporarily unavailable. Please try again in a moment.'
        : `Server error (${res.status}). Please try again.`;
      return { ok: false, data: { error: errorMsg }, status: res.status };
    }
    const data = await res.json();
    return { ok: res.ok, data, status: res.status };
  }

  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    setResult(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      // ── Phase 1: Upload file to storage ──
      setPhase('uploading');

      const formData = new FormData();
      formData.append('file', file);
      const agency = lockedAgency || agencyOverride;
      if (agency) formData.append('agency', agency);

      const uploadRes = await fetchWithRetry(
        '/api/pending-applications/upload',
        { method: 'POST', body: formData, signal: abort.signal }
      );
      const upload = await parseResponse(uploadRes);

      if (!upload.ok) {
        setError((upload.data.error as string) || 'Upload failed');
        setPhase('error');
        return;
      }

      const { storagePath, agency: detectedAgency } = upload.data as {
        storagePath: string;
        agency: string;
      };

      // ── Phase 2: Process the uploaded file ──
      setPhase('processing');

      const processRes = await fetchWithRetry(
        '/api/pending-applications/process',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath, agency: detectedAgency }),
          signal: abort.signal,
        }
      );
      const processed = await parseResponse(processRes);

      if (!processed.ok) {
        setError((processed.data.error as string) || 'Processing failed');
        setPhase('error');
        return;
      }

      setResult(processed.data as unknown as UploadResult);
      setFile(null);
      setPhase('done');
      onSuccess?.();
    } catch (err) {
      if (abort.signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Network error: ${message}`);
      setPhase('error');
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setFile(null);
    setError(null);
    setResult(null);
    setPhase('idle');
    setAgencyOverride('');
  };

  const isWorking = phase === 'uploading' || phase === 'processing';

  return (
    <div className="space-y-6">
      <div className="card-premium p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Upload Pending Applications</h3>
        <p className="text-sm text-navy-600 mb-6">
          Upload GPL or GWI pending service connection Excel files. The agency will be auto-detected from the file structure.
        </p>

        {/* Drop Zone */}
        {phase !== 'done' && (
          <>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                dragOver ? 'border-gold-500 bg-gold-500/5' :
                file ? 'border-emerald-500/50 bg-emerald-500/5' :
                'border-navy-800 hover:border-navy-600'
              }`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-emerald-400" />
                  <div className="text-left">
                    <p className="text-white font-medium">{file.name}</p>
                    <p className="text-xs text-navy-600">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  {!isWorking && (
                    <button onClick={reset} className="p-1.5 rounded-lg hover:bg-navy-800 text-navy-600 hover:text-white ml-2" aria-label="Remove file">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-navy-600 mx-auto mb-3" />
                  <p className="text-slate-400 font-medium">Drop Excel file here or click to browse</p>
                  <p className="text-xs text-navy-600 mt-1">.xls or .xlsx files, up to 10MB</p>
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    aria-label="Select Excel file to upload"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={e => { if (e.target.files?.[0]) selectFile(e.target.files[0]); }}
                  />
                </>
              )}
            </div>

            {/* Agency Override (hidden when agency is locked or working) */}
            {file && !lockedAgency && !isWorking && (
              <div className="mt-4 flex items-center gap-3">
                <label className="text-sm text-navy-600">Agency override (optional):</label>
                <div className="flex gap-2">
                  {(['', 'GPL', 'GWI'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setAgencyOverride(opt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        agencyOverride === opt
                          ? 'bg-gold-500 text-navy-950'
                          : 'bg-navy-900 text-slate-400 border border-navy-800 hover:border-gold-500'
                      }`}
                    >
                      {opt || 'Auto'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Button / Progress */}
            {file && (
              <div className="mt-4">
                {isWorking ? (
                  <div className="space-y-3">
                    {/* Progress steps */}
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-navy-900/50 border border-navy-800">
                      <Loader2 className="h-4 w-4 animate-spin text-gold-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium">
                          {phase === 'uploading' ? 'Uploading file...' : 'Processing records...'}
                        </p>
                        <p className="text-xs text-navy-600 mt-0.5">
                          {phase === 'uploading'
                            ? 'Storing file securely'
                            : 'Parsing Excel, updating database, running analysis'}
                        </p>
                      </div>
                    </div>
                    {/* Step indicators */}
                    <div className="flex items-center gap-2 px-1">
                      <div className={`h-1.5 flex-1 rounded-full transition-colors ${
                        phase === 'uploading' ? 'bg-gold-500 animate-pulse' : 'bg-emerald-500'
                      }`} />
                      <div className={`h-1.5 flex-1 rounded-full transition-colors ${
                        phase === 'processing' ? 'bg-gold-500 animate-pulse' : 'bg-navy-800'
                      }`} />
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleUpload}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gold-500 text-navy-950 font-semibold hover:bg-[#e5c547] transition-colors"
                  >
                    <Upload className="h-4 w-4" />Upload &amp; Import
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-400 font-medium">
                {phase === 'error' && file ? 'Upload Failed' : 'Error'}
              </p>
              <p className="text-xs text-red-400/80 mt-1">{error}</p>
              {phase === 'error' && file && (
                <button
                  onClick={handleUpload}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        {/* Success Result */}
        {result && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-emerald-400 font-medium">Import Successful</p>
                <p className="text-xs text-emerald-400/80 mt-1">
                  {result.recordCount} {result.agency} records imported (data as of {result.dataAsOf})
                </p>
              </div>
            </div>

            {/* Breakdown */}
            <div className="card-premium p-4">
              <h4 className="text-sm font-semibold text-white mb-3">
                {result.agency === 'GPL' ? 'Pipeline Stage Breakdown' : 'Regional Breakdown'}
              </h4>
              <div className="space-y-2">
                {Object.entries(result.breakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([key, count]) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">{key}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 rounded-full bg-navy-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${result.agency === 'GPL' ? 'bg-amber-400' : 'bg-cyan-400'}`}
                            style={{ width: `${Math.round((count / result.recordCount) * 100)}%` }}
                          />
                        </div>
                        <span className="text-white font-medium w-8 text-right">{count}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-xs text-yellow-400 font-medium mb-1">Warnings:</p>
                {result.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-yellow-400/80">{w}</p>
                ))}
              </div>
            )}

            <button onClick={reset} className="w-full px-4 py-2.5 rounded-xl bg-navy-900 border border-navy-800 hover:border-gold-500 text-slate-400 hover:text-white text-sm transition-colors">
              Upload Another File
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
