'use client';

import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';

interface UploadResult {
  success: boolean;
  snapshotId: string;
  snapshotDate: string;
  counts: {
    trackAOutstanding: number;
    trackACompleted: number;
    trackBDesignOutstanding: number;
    trackBDesignCompleted: number;
    trackBExecutionOutstanding: number;
    trackBExecutionCompleted: number;
  };
  warnings: { type: string; severity: string; message: string }[];
  metricsCount: number;
}

export function SCUpload({ onSuccess }: { onSuccess?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback((f: File) => {
    const name = f.name.toLowerCase();
    if (!name.endsWith('.xls') && !name.endsWith('.xlsx')) {
      setError('Only .xls and .xlsx files are accepted.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum size is 10MB.');
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
  }, []);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/gpl/sc-upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Upload failed');
      } else {
        setResult(data);
        onSuccess?.();
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setUploading(false);
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  if (result) {
    const c = result.counts;
    const totalRecords = c.trackAOutstanding + c.trackACompleted + c.trackBDesignOutstanding + c.trackBDesignCompleted + c.trackBExecutionOutstanding + c.trackBExecutionCompleted;
    return (
      <div className="card-premium p-4 md:p-6 border border-emerald-500/30">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="h-5 w-5 text-emerald-400" />
          <h3 className="text-sm font-semibold text-emerald-400">Upload Successful</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs mb-3">
          <div><span className="text-navy-600">Snapshot:</span> <span className="text-white">{result.snapshotDate}</span></div>
          <div><span className="text-navy-600">Total Records:</span> <span className="text-white">{totalRecords}</span></div>
          <div><span className="text-navy-600">Metrics Computed:</span> <span className="text-white">{result.metricsCount}</span></div>
          <div><span className="text-navy-600">Simple Waiting:</span> <span className="text-white">{c.trackAOutstanding}</span></div>
          <div><span className="text-navy-600">Simple Done:</span> <span className="text-white">{c.trackACompleted}</span></div>
          <div><span className="text-navy-600">Estimates Waiting:</span> <span className="text-white">{c.trackBDesignOutstanding}</span></div>
          <div><span className="text-navy-600">Estimates Done:</span> <span className="text-white">{c.trackBDesignCompleted}</span></div>
          <div><span className="text-navy-600">Capital Works Waiting:</span> <span className="text-white">{c.trackBExecutionOutstanding}</span></div>
          <div><span className="text-navy-600">Capital Works Done:</span> <span className="text-white">{c.trackBExecutionCompleted}</span></div>
        </div>
        {result.warnings.length > 0 && (
          <div className="text-xs text-amber-400 mb-3">{result.warnings.length} notes flagged during processing</div>
        )}
        <button onClick={reset} className="text-xs text-gold-500 hover:text-[#f0d060]">Upload another file</button>
      </div>
    );
  }

  return (
    <div className="card-premium p-4 md:p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-gold-500" />
          <h3 className="text-sm font-semibold text-white">Upload Service Connection Excel</h3>
        </div>
        {file && (
          <button onClick={reset} className="text-navy-600 hover:text-white" aria-label="Remove file">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!file ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
            dragOver ? 'border-gold-500 bg-gold-500/5' : 'border-navy-800 hover:border-navy-600'
          }`}
        >
          <input
            type="file"
            accept=".xls,.xlsx"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            className="hidden"
            id="sc-upload-input"
            aria-label="Upload GPL Service Connection Excel file"
          />
          <label htmlFor="sc-upload-input" className="cursor-pointer">
            <FileSpreadsheet className="h-8 w-8 text-navy-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Drop GPL Excel file here or click to browse</p>
            <p className="text-xs text-navy-600 mt-1">.xls or .xlsx, max 10MB</p>
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <FileSpreadsheet className="h-4 w-4 text-gold-500" />
            <span className="text-white">{file.name}</span>
            <span className="text-navy-600 text-xs">({(file.size / 1024).toFixed(0)} KB)</span>
          </div>
          <button
            onClick={upload}
            disabled={uploading}
            className="btn-navy px-4 py-2 text-sm w-full flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload & Process
              </>
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 mt-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
