'use client';

import { useState, useCallback } from 'react';
import {
  Upload, X, FileSpreadsheet, AlertCircle, CheckCircle, Loader2,
  TrendingUp, TrendingDown, Calendar, BarChart3
} from 'lucide-react';

const API_BASE = '/api';

interface GPLKpiUploadProps {
  onSuccess?: (result: any) => void;
  onCancel?: () => void;
}

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB Vercel limit

export function GPLKpiUpload({ onSuccess, onCancel }: GPLKpiUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

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
    if (droppedFile?.name.endsWith('.csv')) {
      if (droppedFile.size > MAX_FILE_SIZE) {
        setError('File too large. Maximum 4.5MB.');
        return;
      }
      setFile(droppedFile);
      setError(null);
      setPreview(null);
    } else {
      setError('Please upload a CSV file');
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_SIZE) {
        setError('File too large. Maximum 4.5MB.');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setPreview(null);
    }
  }, []);

  const parseFile = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setWarnings([]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/gpl/kpi/upload`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || result.details || 'Failed to parse CSV');
        if (result.warnings) setWarnings(result.warnings);
        return;
      }

      setPreview(result.preview);
      setParsedData(result.data);
      if (result.warnings) setWarnings(result.warnings);

    } catch (err: any) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const confirmUpload = async () => {
    if (!preview || !parsedData) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/gpl/kpi/upload/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview, data: parsedData, warnings })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || 'Failed to save data');
        return;
      }

      // Success
      if (onSuccess) {
        onSuccess(result);
      }

    } catch (err: any) {
      setError(`Save failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setPreview(null);
    setParsedData(null);
    setError(null);
    setWarnings([]);
  };

  // Format value for display
  const formatValue = (kpi: string, value: any) => {
    if (value === null || value === undefined) return 'N/A';
    if (kpi.includes('%')) return `${value.toFixed(1)}%`;
    if (kpi.includes('Capacity') || kpi.includes('Demand')) return `${value.toFixed(1)} MW`;
    if (kpi.includes('Customers')) return value.toLocaleString();
    return value.toFixed(2);
  };

  return (
    <div className="bg-[#1a2744] rounded-xl p-6 border border-[#2d3a52]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-emerald-400" />
          Upload Monthly KPI CSV
        </h3>
        {onCancel && (
          <button onClick={onCancel} className="text-[#94a3b8] hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-4 p-3 bg-amber-500/20 border border-amber-500/50 rounded-lg">
          <p className="text-amber-300 text-sm font-medium mb-1">Warnings:</p>
          <ul className="text-amber-200 text-xs space-y-1">
            {warnings.map((w, i) => (
              <li key={i}>&#8226; {w}</li>
            ))}
          </ul>
        </div>
      )}

      {!preview ? (
        <>
          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragOver
                ? 'border-emerald-400 bg-emerald-400/10'
                : 'border-slate-600 hover:border-slate-500'
            }`}
          >
            <Upload className={`w-12 h-12 mx-auto mb-4 ${dragOver ? 'text-emerald-400' : 'text-[#64748b]'}`} />
            <p className="text-white mb-2">
              {file ? file.name : 'Drag and drop your KPI CSV file here'}
            </p>
            <p className="text-[#64748b] text-sm mb-4">or</p>
            <label className="inline-block px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg cursor-pointer transition-colors">
              Browse Files
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
            {file && (
              <p className="mt-4 text-sm text-[#94a3b8]">
                Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          {/* Parse Button */}
          {file && (
            <button
              onClick={parseFile}
              disabled={loading}
              className="mt-4 w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-5 h-5" />
                  Parse CSV File
                </>
              )}
            </button>
          )}
        </>
      ) : (
        /* Preview */
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-[#0a1628]/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-white font-medium">Preview</h4>
              <span className="text-xs text-emerald-400 bg-emerald-500/20 px-2 py-1 rounded">
                {preview.totalRows} rows parsed
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[#64748b]">Date Range</p>
                <p className="text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#94a3b8]" />
                  {preview.dateRange?.start} to {preview.dateRange?.end}
                </p>
              </div>
              <div>
                <p className="text-[#64748b]">Months</p>
                <p className="text-white">{preview.monthsCount} months</p>
              </div>
            </div>
          </div>

          {/* KPIs Found */}
          <div className="bg-[#0a1628]/50 rounded-lg p-4">
            <h4 className="text-white font-medium mb-3">KPIs Found ({preview.kpisFound?.length})</h4>
            <div className="flex flex-wrap gap-2">
              {preview.kpisFound?.map((kpi: string, i: number) => (
                <span
                  key={i}
                  className="text-xs px-2 py-1 rounded bg-[#2d3a52] text-white"
                >
                  {kpi}
                </span>
              ))}
            </div>
          </div>

          {/* Latest Month Snapshot */}
          <div className="bg-[#0a1628]/50 rounded-lg p-4">
            <h4 className="text-white font-medium mb-3">
              Latest Month: {preview.latestMonth}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(preview.latestSnapshot || {}).map(([kpi, value]) => (
                <div key={kpi} className="bg-[#1a2744] rounded-lg p-3">
                  <p className="text-[#94a3b8] text-xs truncate" title={kpi}>{kpi}</p>
                  <p className="text-white font-semibold">
                    {formatValue(kpi, value)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={resetForm}
              className="flex-1 py-3 bg-[#2d3a52] hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmUpload}
              disabled={submitting}
              className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Confirm &amp; Save
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
