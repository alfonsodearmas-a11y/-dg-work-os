'use client';

import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

export function UploadPanel({ onSuccess, lockedAgency }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [agencyOverride, setAgencyOverride] = useState<'' | 'GPL' | 'GWI'>('');

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

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const agency = lockedAgency || agencyOverride;
      if (agency) formData.append('agency', agency);

      const res = await fetch('/api/pending-applications/upload', { method: 'POST', body: formData });

      // Handle non-JSON responses (timeouts, server errors return HTML)
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setError(res.status === 504 ? 'Request timed out — the file may be too large. Try again.' : `Server error (${res.status})`);
        setUploading(false);
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Upload failed');
      } else {
        setResult(data);
        setFile(null);
        onSuccess?.();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Network error: ${message}`);
    }
    setUploading(false);
  };

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setAgencyOverride('');
  };

  return (
    <div className="space-y-6">
      <div className="card-premium p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Upload Pending Applications</h3>
        <p className="text-sm text-[#64748b] mb-6">
          Upload GPL or GWI pending service connection Excel files. The agency will be auto-detected from the file structure.
        </p>

        {/* Drop Zone */}
        {!result && (
          <>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                dragOver ? 'border-[#d4af37] bg-[#d4af37]/5' :
                file ? 'border-emerald-500/50 bg-emerald-500/5' :
                'border-[#2d3a52] hover:border-[#64748b]'
              }`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-emerald-400" />
                  <div className="text-left">
                    <p className="text-white font-medium">{file.name}</p>
                    <p className="text-xs text-[#64748b]">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button onClick={reset} className="p-1.5 rounded-lg hover:bg-[#2d3a52] text-[#64748b] hover:text-white ml-2">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-[#64748b] mx-auto mb-3" />
                  <p className="text-[#94a3b8] font-medium">Drop Excel file here or click to browse</p>
                  <p className="text-xs text-[#64748b] mt-1">.xls or .xlsx files, up to 10MB</p>
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={e => { if (e.target.files?.[0]) selectFile(e.target.files[0]); }}
                  />
                </>
              )}
            </div>

            {/* Agency Override (hidden when agency is locked) */}
            {file && !lockedAgency && (
              <div className="mt-4 flex items-center gap-3">
                <label className="text-sm text-[#64748b]">Agency override (optional):</label>
                <div className="flex gap-2">
                  {(['', 'GPL', 'GWI'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setAgencyOverride(opt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        agencyOverride === opt
                          ? 'bg-[#d4af37] text-[#0a1628]'
                          : 'bg-[#1a2744] text-[#94a3b8] border border-[#2d3a52] hover:border-[#d4af37]'
                      }`}
                    >
                      {opt || 'Auto'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Button */}
            {file && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#d4af37] text-[#0a1628] font-semibold hover:bg-[#e5c547] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Uploading &amp; Processing...</>
                ) : (
                  <><Upload className="h-4 w-4" />Upload &amp; Import</>
                )}
              </button>
            )}
          </>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-400 font-medium">Upload Failed</p>
              <p className="text-xs text-red-400/80 mt-1">{error}</p>
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
                      <span className="text-[#94a3b8]">{key}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 rounded-full bg-[#2d3a52] overflow-hidden">
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

            <button onClick={reset} className="w-full px-4 py-2.5 rounded-xl bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] hover:text-white text-sm transition-colors">
              Upload Another File
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
