'use client';

import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X, Sun, Zap, Brain, AlertTriangle, RefreshCw, TrendingUp } from 'lucide-react';

const API_BASE = '/api';

interface GPLExcelUploadProps {
  onSuccess?: (result: any) => void;
  onCancel?: () => void;
}

export function GPLExcelUpload({ onSuccess, onCancel }: GPLExcelUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // After successful upload, store the saved data
  const [savedData, setSavedData] = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

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
    if (droppedFile && droppedFile.name.match(/\.xlsx$/i)) {
      setFile(droppedFile);
      setError(null);
      setPreview(null);
      setSavedData(null);
      setAiAnalysis(null);
    } else {
      setError('Please upload an Excel file (.xlsx)');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setPreview(null);
      setSavedData(null);
      setAiAnalysis(null);
    }
  };

  const parseFile = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/gpl/upload`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        const errMsg = typeof result.error === 'string' ? result.error : result.error?.message || 'Failed to parse file';
        setError(errMsg);
        return;
      }

      setPreview(result.preview);
    } catch (err: any) {
      setError('Failed to upload file: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitData = async () => {
    if (!preview) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/gpl/upload/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preview,
          triggerAI: true
        }),
      });

      const result = await response.json();

      if (!result.success) {
        const errMsg = typeof result.error === 'string' ? result.error : result.error?.message || 'Failed to submit data';
        setError(errMsg);
        return;
      }

      // Save the result and fetch the full data
      setSavedData(result);

      // Fetch the latest data to display
      await fetchLatestData();

      // Start polling for AI analysis
      if (result.uploadId) {
        pollForAnalysis(result.uploadId);
      }

      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err: any) {
      setError('Failed to submit: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const fetchLatestData = async () => {
    try {
      const response = await fetch(`${API_BASE}/gpl/latest`);
      const data = await response.json();
      if (data.summary) {
        setSavedData((prev: any) => ({ ...prev, latestData: data }));
      }
    } catch (err) {
      console.error('Failed to fetch latest data:', err);
    }
  };

  const pollForAnalysis = async (uploadId: string) => {
    setLoadingAnalysis(true);

    // Poll every 2 seconds for up to 60 seconds
    const maxAttempts = 30;
    let attempts = 0;

    const checkAnalysis = async (): Promise<boolean> => {
      try {
        const response = await fetch(`${API_BASE}/gpl/analysis/${uploadId}`);
        const data = await response.json();

        if (data.analysis_status === 'completed' && data.executive_briefing) {
          setAiAnalysis(data);
          setLoadingAnalysis(false);
          return true;
        } else if (data.analysis_status === 'failed') {
          setAiAnalysis({ error: data.error_message || 'Analysis failed', ...data });
          setLoadingAnalysis(false);
          return true;
        }
      } catch (err) {
        console.error('Error checking analysis:', err);
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(checkAnalysis, 2000);
      } else {
        setLoadingAnalysis(false);
      }
      return false;
    };

    // Start checking after a short delay
    setTimeout(checkAnalysis, 1000);
  };

  const retryAnalysis = async () => {
    if (!savedData?.uploadId) return;

    setLoadingAnalysis(true);
    setAiAnalysis(null);

    try {
      await fetch(`${API_BASE}/gpl/analysis/${savedData.uploadId}/retry`, {
        method: 'POST'
      });

      pollForAnalysis(savedData.uploadId);
    } catch (err: any) {
      setError('Failed to retry analysis: ' + err.message);
      setLoadingAnalysis(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setSavedData(null);
    setAiAnalysis(null);
  };

  const uploadAnother = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    // Keep savedData visible but allow new upload
  };

  const { summary, stats, stations, warnings } = preview || {};
  const latestData = savedData?.latestData;

  // If we have saved data, show the results view
  if (savedData && !preview) {
    const displaySummary = latestData?.summary;
    const displayStations = latestData?.stations || [];
    const displayAnalysis = latestData?.analysis || aiAnalysis;

    return (
      <div className="bg-[#1a2744] rounded-xl p-6 border border-[#2d3a52]">
        {/* Success Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-full">
              <CheckCircle className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Data Saved Successfully</h3>
              <p className="text-sm text-[#94a3b8]">Report Date: {savedData.latestData?.summary?.report_date?.split('T')[0] || 'N/A'}</p>
            </div>
          </div>
          <button
            onClick={uploadAnother}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Upload Another
          </button>
        </div>

        {/* Key Metrics */}
        {displaySummary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="p-3 bg-amber-500/20 rounded-lg">
              <div className="text-[#94a3b8] text-xs">Fossil Capacity</div>
              <div className="text-xl font-bold text-amber-400">
                {parseFloat(displaySummary.total_fossil_fuel_capacity_mw || 0).toFixed(1)} MW
              </div>
            </div>
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <div className="text-[#94a3b8] text-xs">Evening Peak</div>
              <div className="text-xl font-bold text-blue-400">
                {parseFloat(displaySummary.evening_peak_on_bars_mw || 0).toFixed(1)} MW
              </div>
            </div>
            <div className="p-3 bg-cyan-500/20 rounded-lg">
              <div className="text-[#94a3b8] text-xs">Reserve Margin</div>
              <div className={`text-xl font-bold ${parseFloat(displaySummary.reserve_margin_pct || 0) < 15 ? 'text-red-400' : 'text-cyan-400'}`}>
                {parseFloat(displaySummary.reserve_margin_pct || 0).toFixed(1)}%
              </div>
            </div>
            <div className="p-3 bg-green-500/20 rounded-lg">
              <div className="text-[#94a3b8] text-xs">Utilization</div>
              <div className="text-xl font-bold text-green-400">
                {parseFloat(displaySummary.system_utilization_pct || 0).toFixed(1)}%
              </div>
            </div>
          </div>
        )}

        {/* Station Status Grid */}
        {displayStations.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-[#94a3b8] mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Station Status
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {displayStations.map((station: any) => (
                <div key={station.station} className="p-2 bg-[#2d3a52]/50 rounded flex items-center justify-between">
                  <div>
                    <span className="text-white text-xs block">{station.station}</span>
                    <span className="text-[#64748b] text-xs">{station.units_online}/{station.total_units} online</span>
                  </div>
                  <div className="text-right">
                    <span className={`font-medium text-sm ${parseFloat(station.station_utilization_pct || 0) >= 80 ? 'text-green-400' : parseFloat(station.station_utilization_pct || 0) >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                      {parseFloat(station.station_utilization_pct || 0).toFixed(0)}%
                    </span>
                    <span className="text-[#64748b] text-xs block">{parseFloat(station.total_available_mw || 0).toFixed(1)} MW</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Analysis Section */}
        <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-purple-300 flex items-center gap-2">
              <Brain className="w-4 h-4" />
              AI Executive Briefing
            </h4>
            {aiAnalysis?.error && (
              <button
                onClick={retryAnalysis}
                disabled={loadingAnalysis}
                className="px-3 py-1 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${loadingAnalysis ? 'animate-spin' : ''}`} />
                Retry
              </button>
            )}
          </div>

          {loadingAnalysis ? (
            <div className="flex items-center gap-3 text-[#94a3b8]">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Generating AI analysis...</span>
            </div>
          ) : aiAnalysis?.executive_briefing && !aiAnalysis.executive_briefing.includes('failed') ? (
            <div className="space-y-4">
              <div className="text-white text-sm whitespace-pre-wrap leading-relaxed">
                {aiAnalysis.executive_briefing}
              </div>

              {/* Critical Alerts */}
              {aiAnalysis.critical_alerts && aiAnalysis.critical_alerts.length > 0 && (
                <div className="mt-4">
                  <h5 className="text-xs font-medium text-red-400 mb-2">Critical Alerts</h5>
                  <div className="space-y-2">
                    {aiAnalysis.critical_alerts.map((alert: any, i: number) => (
                      <div key={i} className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs">
                        <span className="font-medium text-red-300">{alert.title}</span>
                        <p className="text-[#94a3b8] mt-1">{alert.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0 && (
                <div className="mt-4">
                  <h5 className="text-xs font-medium text-blue-400 mb-2">Recommendations</h5>
                  <ul className="space-y-1 text-xs text-[#94a3b8]">
                    {aiAnalysis.recommendations.map((rec: any, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <TrendingUp className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                        <span>{rec.recommendation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : aiAnalysis?.error || aiAnalysis?.executive_briefing?.includes('failed') ? (
            <div className="text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 inline mr-2" />
              {aiAnalysis.error || 'AI analysis failed. Click Retry to try again.'}
            </div>
          ) : (
            <div className="text-[#64748b] text-sm">
              AI analysis will appear here once processing completes.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1a2744] rounded-xl p-6 border border-[#2d3a52]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-amber-400" />
          Upload GPL DBIS Excel
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
          <span>{typeof error === 'string' ? error : JSON.stringify(error)}</span>
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
                ? 'border-amber-400 bg-amber-400/10'
                : 'border-slate-600 hover:border-slate-500'
            }`}
          >
            <Upload className={`w-12 h-12 mx-auto mb-4 ${dragOver ? 'text-amber-400' : 'text-[#64748b]'}`} />
            <p className="text-white mb-2">
              {file ? file.name : 'Drag and drop your DBIS Excel file here'}
            </p>
            <p className="text-[#64748b] text-sm mb-4">or</p>
            <label className="inline-block px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg cursor-pointer transition-colors">
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
                Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          {/* Parse Button */}
          {file && (
            <button
              onClick={parseFile}
              disabled={loading}
              className="mt-4 w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-600 text-black font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-5 h-5" />
                  Parse Excel File
                </>
              )}
            </button>
          )}
        </>
      ) : (
        <>
          {/* Preview Section */}
          <div className="space-y-4">
            {/* Warnings */}
            {warnings && warnings.length > 0 && (
              <div className="p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
                <div className="flex items-center gap-2 text-yellow-300 mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-medium">Parsing Warnings</span>
                </div>
                <ul className="text-xs text-yellow-200 space-y-1">
                  {warnings.map((w: string, i: number) => (
                    <li key={i}>&#8226; {w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Report Date & Meta */}
            <div className="p-4 bg-[#2d3a52]/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[#94a3b8]">Report Date</span>
                <span className="text-white font-semibold">{preview.reportDate}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#64748b]">Date Column: {preview.detectedDateColumn}</span>
                <span className="text-[#64748b]">
                  {stats?.totalStations} stations, {stats?.totalUnits} units
                </span>
              </div>
            </div>

            {/* Unit Status Overview */}
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 bg-green-500/20 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-400">{stats?.unitsOnline || 0}</div>
                <div className="text-xs text-[#94a3b8]">Online</div>
              </div>
              <div className="p-3 bg-red-500/20 rounded-lg text-center">
                <div className="text-2xl font-bold text-red-400">{stats?.unitsOffline || 0}</div>
                <div className="text-xs text-[#94a3b8]">Offline</div>
              </div>
              <div className="p-3 bg-[#2d3a52]/50 rounded-lg text-center">
                <div className="text-2xl font-bold text-[#94a3b8]">{stats?.unitsNoData || 0}</div>
                <div className="text-xs text-[#94a3b8]">No Data</div>
              </div>
              <div className="p-3 bg-purple-500/20 rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-400">{stats?.totalOutages || 0}</div>
                <div className="text-xs text-[#94a3b8]">Outages</div>
              </div>
            </div>

            {/* Station Summary */}
            <div className="p-4 bg-[#2d3a52]/50 rounded-lg">
              <h4 className="text-sm font-medium text-[#94a3b8] mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Station Status
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {stations?.map((station: any) => (
                  <div key={station.station} className="p-2 bg-[#1a2744] rounded flex items-center justify-between">
                    <div>
                      <span className="text-white text-xs block">{station.station}</span>
                      <span className="text-[#64748b] text-xs">{station.unitsOnline}/{station.totalUnits} online</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-medium text-sm ${station.utilizationPct >= 80 ? 'text-green-400' : station.utilizationPct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                        {station.utilizationPct?.toFixed(0) || 0}%
                      </span>
                      <span className="text-[#64748b] text-xs block">{station.totalAvailableMw?.toFixed(1)} MW</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-amber-500/20 rounded-lg">
                <div className="text-[#94a3b8] text-xs">Fossil Capacity</div>
                <div className="text-xl font-bold text-amber-400">
                  {summary?.totalFossilFuelCapacityMw?.toFixed(1) || '\u2014'} MW
                </div>
              </div>
              <div className="p-3 bg-blue-500/20 rounded-lg">
                <div className="text-[#94a3b8] text-xs">Expected Peak</div>
                <div className="text-xl font-bold text-blue-400">
                  {summary?.expectedPeakDemandMw?.toFixed(1) || '\u2014'} MW
                </div>
              </div>
              <div className="p-3 bg-cyan-500/20 rounded-lg">
                <div className="text-[#94a3b8] text-xs">Reserve</div>
                <div className="text-xl font-bold text-cyan-400">
                  {summary?.reserveCapacityMw?.toFixed(1) || '\u2014'} MW
                </div>
              </div>
              <div className="p-3 bg-[#2d3a52]/50 rounded-lg">
                <div className="text-[#94a3b8] text-xs">DBIS Capacity</div>
                <div className="text-xl font-bold text-white">
                  {summary?.totalDBISCapacityMw?.toFixed(1) || '\u2014'} MW
                </div>
              </div>
            </div>

            {/* Peak Demand */}
            {(summary?.eveningPeak || summary?.dayPeak) && (
              <div className="p-4 bg-[#2d3a52]/50 rounded-lg">
                <h4 className="text-sm font-medium text-[#94a3b8] mb-3">Peak Demand</h4>
                <div className="grid grid-cols-2 gap-4">
                  {summary?.eveningPeak && (
                    <div>
                      <div className="text-xs text-[#64748b]">Evening Peak</div>
                      <div className="text-lg font-semibold text-white">
                        {summary.eveningPeak.onBars?.toFixed(1)} MW
                        {summary.eveningPeak.suppressed && (
                          <span className="text-sm text-[#94a3b8] ml-1">
                            ({summary.eveningPeak.suppressed?.toFixed(1)} suppressed)
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {summary?.dayPeak && (
                    <div>
                      <div className="text-xs text-[#64748b]">Day Peak</div>
                      <div className="text-lg font-semibold text-white">
                        {summary.dayPeak.onBars?.toFixed(1)} MW
                        {summary.dayPeak.suppressed && (
                          <span className="text-sm text-[#94a3b8] ml-1">
                            ({summary.dayPeak.suppressed?.toFixed(1)} suppressed)
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Solar Data */}
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
              <h4 className="text-sm font-medium text-green-400 mb-3 flex items-center gap-2">
                <Sun className="w-4 h-4" />
                Renewable Capacity (MWp)
              </h4>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <div className="text-xs text-[#94a3b8]">Hampshire</div>
                  <div className="text-lg font-semibold text-green-400">{summary?.solarHampshireMwp || 0}</div>
                </div>
                <div>
                  <div className="text-xs text-[#94a3b8]">Prospect</div>
                  <div className="text-lg font-semibold text-green-400">{summary?.solarProspectMwp || 0}</div>
                </div>
                <div>
                  <div className="text-xs text-[#94a3b8]">Trafalgar</div>
                  <div className="text-lg font-semibold text-green-400">{summary?.solarTrafalgarMwp || 0}</div>
                </div>
                <div>
                  <div className="text-xs text-[#94a3b8]">Total Renewable</div>
                  <div className="text-lg font-semibold text-green-400">{summary?.totalRenewableMwp || 0}</div>
                </div>
              </div>
            </div>

            {/* AI Analysis Notice */}
            <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg flex items-center gap-3">
              <Brain className="w-8 h-8 text-purple-400" />
              <div>
                <div className="text-sm font-medium text-purple-300">AI Analysis</div>
                <div className="text-xs text-[#94a3b8]">
                  Upon confirmation, an AI-powered executive briefing will be generated automatically.
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={reset}
                className="flex-1 py-3 bg-[#2d3a52] hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitData}
                disabled={submitting}
                className="flex-1 py-3 bg-green-500 hover:bg-green-600 disabled:bg-slate-600 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting...
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
        </>
      )}
    </div>
  );
}
