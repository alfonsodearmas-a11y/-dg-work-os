'use client';

import { useState, useCallback } from 'react';
import {
  Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X,
  Send, Calendar, BarChart3, Brain, AlertTriangle, ChevronDown, ChevronUp,
  RefreshCw, Clock, TrendingUp
} from 'lucide-react';

const API_BASE = '/api';

interface DailyExcelUploadProps {
  onSuccess?: (result: any) => void;
  onCancel?: () => void;
}

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB Vercel limit

export function DailyExcelUpload({ onSuccess, onCancel }: DailyExcelUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [requiresOverwrite, setRequiresOverwrite] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.match(/\.xlsx$/i)) {
      if (droppedFile.size > MAX_FILE_SIZE) {
        setError('File too large. Maximum 4.5MB.');
        return;
      }
      setFile(droppedFile);
      setError(null);
      setPreview(null);
      setWarnings([]);
      setAnalysis(null);
      setRequiresOverwrite(false);
    } else {
      setError('Please upload an Excel file (.xlsx)');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_SIZE) {
        setError('File too large. Maximum 4.5MB.');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setPreview(null);
      setWarnings([]);
      setAnalysis(null);
      setRequiresOverwrite(false);
    }
  };

  const parseFile = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setWarnings([]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/upload/daily`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        const errMsg = typeof result.error === 'string' ? result.error : result.error?.message || 'Failed to parse file';
        setError(errMsg);
        return;
      }

      setPreview(result.data);
      setWarnings(result.warnings || []);
    } catch (err: any) {
      setError('Failed to upload file: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitData = async (overwrite = false) => {
    if (!file || !preview) return;

    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE}/upload/daily/confirm`, {
        method: 'POST',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      // For overwrite, we need to send as JSON with the overwrite flag
      if (overwrite) {
        const formDataWithOverwrite = new FormData();
        formDataWithOverwrite.append('file', file);
        formDataWithOverwrite.append('overwrite', 'true');

        const overwriteResponse = await fetch(`${API_BASE}/upload/daily/confirm`, {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: formDataWithOverwrite,
        });

        const overwriteResult = await overwriteResponse.json();

        if (!overwriteResult.success) {
          setError(overwriteResult.error || 'Failed to submit data');
          return;
        }

        setAnalysis(overwriteResult.analysis);
        if (onSuccess) {
          onSuccess(overwriteResult);
        }
        return;
      }

      const result = await response.json();

      if (!result.success) {
        if (result.requiresOverwrite) {
          setRequiresOverwrite(true);
          setError(`Data for ${preview.date} already exists. Click "Replace Existing Data" to overwrite.`);
          return;
        }
        const errMsg = typeof result.error === 'string' ? result.error : result.error?.message || 'Failed to submit data';
        setError(errMsg);
        return;
      }

      setAnalysis(result.analysis);

      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err: any) {
      setError('Failed to submit: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setWarnings([]);
    setAnalysis(null);
    setRequiresOverwrite(false);
  };

  // Group metrics by category for display
  const groupedMetrics = preview?.records?.reduce((acc: any, record: any) => {
    const category = record.category || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(record);
    return acc;
  }, {}) || {};

  const displayedMetrics = showAllMetrics
    ? preview?.records
    : preview?.records?.slice(0, 15);

  return (
    <div className="bg-[#1a2744] border border-[#2d3a52] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-white/20">
              <FileSpreadsheet className="text-white" size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Daily Metrics Upload</h2>
              <p className="text-white/80">Upload daily Excel workbook with AI analysis</p>
            </div>
          </div>
          {onCancel && (
            <button onClick={onCancel} className="text-white/70 hover:text-white p-2">
              <X size={24} />
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="text-red-300">{error}</span>
              {requiresOverwrite && (
                <button
                  onClick={() => submitData(true)}
                  disabled={submitting}
                  className="mt-3 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg flex items-center gap-2 transition-colors"
                >
                  <RefreshCw size={16} />
                  Replace Existing Data
                </button>
              )}
            </div>
          </div>
        )}

        {/* Warnings Display */}
        {warnings.length > 0 && (
          <div className="mb-4 space-y-2">
            {warnings.map((warning: any, i: number) => (
              <div key={i} className="p-3 bg-amber-500/20 border border-amber-500/50 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-amber-300 text-sm font-medium">{warning.type}</span>
                  <p className="text-amber-200 text-sm">{warning.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Analysis Display (after successful submission) */}
        {analysis && analysis.status === 'completed' && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-5 h-5 text-emerald-400" />
              <h4 className="text-lg font-semibold text-emerald-400">AI Analysis</h4>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">Claude</span>
            </div>

            {/* Executive Summary */}
            <div className="mb-4 p-3 bg-[#0a1628] rounded-lg">
              <h5 className="text-sm font-medium text-[#94a3b8] mb-2">Executive Summary</h5>
              <p className="text-white text-sm">{analysis.executive_summary}</p>
            </div>

            {/* Anomalies */}
            {analysis.anomalies && analysis.anomalies.length > 0 && (
              <div className="mb-4">
                <h5 className="text-sm font-medium text-[#94a3b8] mb-2">Anomalies Detected</h5>
                <div className="space-y-2">
                  {analysis.anomalies.map((anomaly: any, i: number) => (
                    <div key={i} className={`p-3 rounded-lg border ${
                      anomaly.severity === 'HIGH' ? 'bg-red-500/10 border-red-500/30' :
                      anomaly.severity === 'MEDIUM' ? 'bg-amber-500/10 border-amber-500/30' :
                      'bg-blue-500/10 border-blue-500/30'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium text-sm">{anomaly.metric_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          anomaly.severity === 'HIGH' ? 'bg-red-500/20 text-red-300' :
                          anomaly.severity === 'MEDIUM' ? 'bg-amber-500/20 text-amber-300' :
                          'bg-blue-500/20 text-blue-300'
                        }`}>{anomaly.severity}</span>
                      </div>
                      <p className="text-[#94a3b8] text-xs mt-1">{anomaly.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attention Items */}
            {analysis.attention_items && analysis.attention_items.length > 0 && (
              <div>
                <h5 className="text-sm font-medium text-[#94a3b8] mb-2">Attention Required</h5>
                <div className="space-y-2">
                  {analysis.attention_items.map((item: any, i: number) => (
                    <div key={i} className="p-3 bg-[#0a1628] rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs bg-[#2d3a52] text-[#94a3b8] px-2 py-0.5 rounded">{item.agency}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          item.priority === 'URGENT' ? 'bg-red-500/20 text-red-300' :
                          item.priority === 'HIGH' ? 'bg-amber-500/20 text-amber-300' :
                          'bg-blue-500/20 text-blue-300'
                        }`}>{item.priority}</span>
                      </div>
                      <p className="text-white text-sm">{item.item}</p>
                      {item.next_steps && (
                        <p className="text-[#64748b] text-xs mt-1">{item.next_steps}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                  ? 'border-indigo-400 bg-indigo-400/10'
                  : 'border-[#2d3a52] hover:border-[#3a4a69]'
              }`}
            >
              <Upload className={`w-12 h-12 mx-auto mb-4 ${dragOver ? 'text-indigo-400' : 'text-[#64748b]'}`} />
              <p className="text-white mb-2">
                {file ? file.name : 'Drag and drop your daily Excel file here'}
              </p>
              <p className="text-[#64748b] text-sm mb-4">Supports wide-format Excel (.xlsx) with 2,500+ columns</p>
              <label className="inline-block px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg cursor-pointer transition-colors">
                Browse Files
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
              {file && (
                <p className="mt-4 text-sm text-[#94a3b8]">
                  Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>

            {/* Parse Button */}
            {file && (
              <button
                onClick={parseFile}
                disabled={loading}
                className="mt-4 w-full py-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-[#2d3a52] text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Parsing Excel File...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-5 h-5" />
                    Parse & Detect Date
                  </>
                )}
              </button>
            )}
          </>
        ) : (
          <>
            {/* Preview Section */}
            <div className="space-y-4">
              {/* Date Detection Banner */}
              <div className={`p-4 rounded-lg border ${
                preview.exactDateMatch
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-amber-500/10 border-amber-500/30'
              }`}>
                <div className="flex items-center gap-3">
                  <Calendar className={`w-6 h-6 ${preview.exactDateMatch ? 'text-emerald-400' : 'text-amber-400'}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${preview.exactDateMatch ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {preview.date}
                      </span>
                      {preview.exactDateMatch ? (
                        <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">Exact Match</span>
                      ) : (
                        <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">Expected: {preview.expectedDate}</span>
                      )}
                    </div>
                    <p className="text-[#94a3b8] text-sm">
                      Data column: {preview.dateColumn} | {preview.recordCount} metrics extracted
                    </p>
                  </div>
                </div>
              </div>

              {/* Stats Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-[#0a1628] rounded-lg">
                  <div className="text-[#64748b] text-xs">Total Records</div>
                  <div className="text-xl font-bold text-white">{preview.stats?.total || 0}</div>
                </div>
                <div className="p-3 bg-[#0a1628] rounded-lg">
                  <div className="text-[#64748b] text-xs">Numeric Values</div>
                  <div className="text-xl font-bold text-emerald-400">{preview.stats?.numeric || 0}</div>
                </div>
                <div className="p-3 bg-[#0a1628] rounded-lg">
                  <div className="text-[#64748b] text-xs">Empty Cells</div>
                  <div className="text-xl font-bold text-amber-400">{preview.stats?.empty || 0}</div>
                </div>
                <div className="p-3 bg-[#0a1628] rounded-lg">
                  <div className="text-[#64748b] text-xs">Errors</div>
                  <div className="text-xl font-bold text-red-400">{preview.stats?.errors || 0}</div>
                </div>
              </div>

              {/* Metrics Preview */}
              <div className="p-4 bg-[#0a1628] rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-[#94a3b8] flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Extracted Metrics Preview
                  </h4>
                  <span className="text-xs text-[#64748b]">
                    Showing {displayedMetrics?.length || 0} of {preview.records?.length || 0}
                  </span>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1">
                  {displayedMetrics?.map((record: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 px-3 bg-[#1a2744] rounded text-sm">
                      <div className="flex-1 min-w-0">
                        <span className="text-white truncate block">{record.metric_name || `Row ${record.row}`}</span>
                        {record.category && (
                          <span className="text-xs text-[#64748b]">{record.category}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        {record.has_error ? (
                          <span className="text-red-400 text-xs">{record.error_detail}</span>
                        ) : record.value_type === 'empty' ? (
                          <span className="text-[#64748b]">&mdash;</span>
                        ) : (
                          <span className={`font-medium ${
                            record.value_type === 'number' ? 'text-emerald-400' :
                            record.value_type === 'percentage' ? 'text-cyan-400' :
                            'text-[#94a3b8]'
                          }`}>
                            {record.numeric_value !== null ? record.numeric_value.toLocaleString() : record.raw_value}
                            {record.unit && <span className="text-[#64748b] text-xs ml-1">{record.unit}</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {preview.records?.length > 15 && (
                  <button
                    onClick={() => setShowAllMetrics(!showAllMetrics)}
                    className="mt-3 w-full py-2 text-sm text-indigo-400 hover:text-indigo-300 flex items-center justify-center gap-1"
                  >
                    {showAllMetrics ? (
                      <>Show Less <ChevronUp size={16} /></>
                    ) : (
                      <>Show All {preview.records.length} Metrics <ChevronDown size={16} /></>
                    )}
                  </button>
                )}
              </div>

              {/* AI Analysis Info */}
              <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-indigo-400" />
                  <span className="text-indigo-300 font-medium">AI Analysis</span>
                </div>
                <p className="text-[#94a3b8] text-sm mt-2">
                  After confirming, Claude will analyze the metrics for anomalies, generate an executive summary, and identify items requiring attention.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-[#2d3a52]">
                <button
                  onClick={reset}
                  className="flex-1 py-3 bg-[#2d3a52] hover:bg-[#3a4a69] text-white font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => submitData(false)}
                  disabled={submitting}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-[#2d3a52] text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Confirm & Analyze
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Processing Time */}
        {preview?.metadata?.processingTimeMs && (
          <div className="mt-4 text-center text-xs text-[#64748b] flex items-center justify-center gap-1">
            <Clock size={12} />
            Parsed in {preview.metadata.processingTimeMs}ms
          </div>
        )}
      </div>
    </div>
  );
}
