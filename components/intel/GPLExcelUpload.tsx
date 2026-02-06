'use client';

import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X, Sun, Zap, Brain, AlertTriangle, RefreshCw, TrendingUp, ChevronDown, Activity } from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';

const API_BASE = '/api';

interface GPLExcelUploadProps {
  onSuccess?: (result: any) => void;
  onCancel?: () => void;
}

function UploadBriefingCard({ section, sevConfig }: { section: { title: string; severity: string; summary: string; detail: string }; sevConfig: { bg: string; text: string; border: string; label: string } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`bg-[#1a2744] rounded-xl border ${sevConfig.border} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-lg font-semibold text-white">{section.title}</span>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium ${sevConfig.bg} ${sevConfig.text}`}>
              {sevConfig.label}
            </span>
            <ChevronDown className={`w-4 h-4 text-[#64748b] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
        <p className="text-base text-[#c8d0dc] leading-snug">{section.summary}</p>
      </button>
      <div className={`collapse-grid ${expanded ? 'open' : ''}`}>
        <div>
          <div className="px-4 pb-4 pt-0">
            <div className="bg-[#0a1628] rounded-lg p-4 border border-[#2d3a52]">
              <p className="text-base text-[#94a3b8] leading-relaxed">{section.detail}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
          uploadData: preview,
          reportDate: preview.reportDate,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        const errMsg = typeof result.error === 'string' ? result.error : result.error?.message || 'Failed to submit data';
        setError(errMsg);
        return;
      }

      // Save the result, clear preview so the success view renders
      setSavedData(result);
      setPreview(null);

      // Fetch the latest data to display
      await fetchLatestData();

      // Start polling for AI analysis
      if (result.uploadId) {
        pollForAnalysis(result.uploadId);
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
      const result = await response.json();
      if (result.success && result.data) {
        setSavedData((prev: any) => ({ ...prev, latestData: result.data }));
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
        const result = await response.json();

        if (result.success && result.data) {
          const { status, analysis } = result.data;
          if (status === 'completed' && analysis?.executiveBriefing) {
            setAiAnalysis(analysis);
            setLoadingAnalysis(false);
            return true;
          } else if (status === 'failed') {
            setAiAnalysis({ error: analysis?.error || 'Analysis failed' });
            setLoadingAnalysis(false);
            return true;
          }
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
      await fetch(`${API_BASE}/gpl/analysis/${savedData.uploadId}`, {
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

  const schedule = preview?.schedule;
  const summary = schedule?.summary;
  const stats = schedule?.stats
    ? { ...schedule.stats, totalOutages: (preview?.outages || []).length }
    : null;
  const stations = schedule?.stations || [];
  const warnings = preview?.warnings || [];
  const latestData = savedData?.latestData;

  // If we have saved data, show the results view
  if (savedData && !preview) {
    const displaySummary = latestData?.summary;
    const displayStations = latestData?.stations || [];
    const displayAnalysis = latestData?.analysis || aiAnalysis;

    // Compute derived metrics
    const fossilMw = parseFloat(displaySummary?.total_fossil_capacity_mw || 0);
    const eveningPeakMw = parseFloat(displaySummary?.evening_peak_on_bars_mw || 0);
    const reserveMw = parseFloat(displaySummary?.reserve_capacity_mw || 0);
    const dbisMw = parseFloat(displaySummary?.total_dbis_capacity_mw || 0);
    const reserveMarginPct = eveningPeakMw > 0 ? ((fossilMw - eveningPeakMw) / fossilMw) * 100 : 0;

    return (
      <div className="bg-[#1a2744] rounded-xl p-6 border border-[#2d3a52]">
        {/* Success Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-full">
              <CheckCircle className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="text-[22px] font-semibold text-white">Data Saved Successfully</h3>
              <p className="text-sm text-[#94a3b8]">Report Date: {savedData.reportDate || latestData?.upload?.reportDate || 'N/A'}</p>
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
              <div className="text-[#94a3b8] text-sm">Fossil Capacity</div>
              <div className="text-xl font-bold text-amber-400">
                {fossilMw.toFixed(1)} MW
              </div>
            </div>
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <div className="text-[#94a3b8] text-sm">Evening Peak</div>
              <div className="text-xl font-bold text-blue-400">
                {eveningPeakMw.toFixed(1)} MW
              </div>
            </div>
            <div className="p-3 bg-cyan-500/20 rounded-lg">
              <div className="text-[#94a3b8] text-sm">Reserve Margin</div>
              <div className={`text-xl font-bold ${reserveMarginPct < 15 ? 'text-red-400' : 'text-cyan-400'}`}>
                {reserveMarginPct.toFixed(1)}%
              </div>
            </div>
            <div className="p-3 bg-green-500/20 rounded-lg">
              <div className="text-[#94a3b8] text-sm">DBIS Capacity</div>
              <div className="text-xl font-bold text-green-400">
                {dbisMw.toFixed(1)} MW
              </div>
            </div>
          </div>
        )}

        {/* Station Status Grid — collapsible */}
        {displayStations.length > 0 && (
          <div className="mb-6">
            <CollapsibleSection
              title="Station Status"
              icon={Zap}
              badge={{ text: `${displayStations.length} stations`, variant: 'gold' }}
              defaultOpen={false}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {displayStations.map((station: any) => {
                  const stationUtil = parseFloat(station.total_derated_capacity_mw || 0) > 0
                    ? (parseFloat(station.total_available_mw || 0) / parseFloat(station.total_derated_capacity_mw)) * 100
                    : 0;
                  return (
                    <div key={station.station} className="p-2 bg-[#2d3a52]/50 rounded flex items-center justify-between">
                      <div>
                        <span className="text-white text-xs block">{station.station}</span>
                        <span className="text-[#64748b] text-xs">{station.units_online}/{station.total_units} online</span>
                      </div>
                      <div className="text-right">
                        <span className={`font-medium text-sm ${stationUtil >= 80 ? 'text-green-400' : stationUtil >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                          {stationUtil.toFixed(0)}%
                        </span>
                        <span className="text-[#64748b] text-xs block">{parseFloat(station.total_available_mw || 0).toFixed(1)} MW</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>
          </div>
        )}

        {/* AI Analysis Section — Progressive Disclosure */}
        <div className="space-y-3">
          {loadingAnalysis ? (
            <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg flex items-center gap-3 text-[#94a3b8]">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Generating AI analysis...</span>
            </div>
          ) : aiAnalysis?.executiveBriefing && !(typeof aiAnalysis.executiveBriefing === 'string' && aiAnalysis.executiveBriefing.includes('failed')) && !(typeof aiAnalysis.executiveBriefing === 'object' && aiAnalysis.executiveBriefing.headline?.includes('failed')) ? (
            (() => {
              // Parse: structured object (new) vs plain string (legacy)
              const rawBriefing = aiAnalysis.executiveBriefing;
              const briefing: { headline: string; sections: { title: string; severity: string; summary: string; detail: string }[] } =
                typeof rawBriefing === 'object' && rawBriefing.headline
                  ? rawBriefing
                  : typeof rawBriefing === 'string'
                    ? {
                        headline: rawBriefing.split('\n')[0]?.slice(0, 250) || 'Analysis completed.',
                        sections: [{ title: 'Full Analysis', severity: 'stable', summary: rawBriefing.split('\n')[1]?.slice(0, 120) || '', detail: rawBriefing }],
                      }
                    : { headline: 'Analysis completed.', sections: [] };

              const sevConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
                critical: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', label: 'Critical' },
                warning:  { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', label: 'Warning' },
                stable:   { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', label: 'Stable' },
                positive: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Good' },
              };

              return (
                <>
                  {/* HEADLINE */}
                  <div className="bg-gradient-to-r from-[#1a2744] to-[#2d3a52]/80 rounded-xl border border-[#d4af37]/20 p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Activity className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-[#d4af37] font-semibold mb-1.5">AI Executive Briefing</p>
                        <p className="text-[22px] font-bold text-[#f1f5f9] leading-snug">{briefing.headline}</p>
                      </div>
                    </div>
                  </div>

                  {/* INSIGHT CARDS — all collapsed */}
                  {briefing.sections.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {briefing.sections.map((section, i) => {
                        const sev = sevConfig[section.severity] || sevConfig.stable;
                        return (
                          <UploadBriefingCard key={i} section={section} sevConfig={sev} />
                        );
                      })}
                    </div>
                  )}

                  {/* CRITICAL ALERTS — collapsed */}
                  {aiAnalysis.criticalAlerts && aiAnalysis.criticalAlerts.length > 0 && (
                    <CollapsibleSection
                      title={`Critical Alerts (${aiAnalysis.criticalAlerts.length})`}
                      icon={AlertTriangle}
                      badge={{ text: `${aiAnalysis.criticalAlerts.length}`, variant: 'danger' }}
                      defaultOpen={false}
                    >
                      <div className="space-y-2">
                        {aiAnalysis.criticalAlerts.map((alert: any, i: number) => (
                          <div key={i} className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                            <span className="text-sm font-semibold text-red-300">{alert.title}</span>
                            <p className="text-[#94a3b8] text-sm mt-1">{alert.description}</p>
                            {alert.recommendation && (
                              <p className="text-blue-400 text-sm mt-1.5">→ {alert.recommendation}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CollapsibleSection>
                  )}

                  {/* RECOMMENDATIONS — collapsed */}
                  {aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0 && (
                    <CollapsibleSection
                      title={`Recommendations (${aiAnalysis.recommendations.length})`}
                      icon={TrendingUp}
                      badge={{ text: `${aiAnalysis.recommendations.length}`, variant: 'info' }}
                      defaultOpen={false}
                    >
                      <ul className="space-y-2 text-sm text-[#94a3b8]">
                        {aiAnalysis.recommendations.map((rec: any, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <TrendingUp className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                            <span>{rec.recommendation}</span>
                          </li>
                        ))}
                      </ul>
                    </CollapsibleSection>
                  )}
                </>
              );
            })()
          ) : aiAnalysis?.error ? (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 inline mr-2" />
                  {aiAnalysis.error || 'AI analysis failed. Click Retry to try again.'}
                </div>
                <button
                  onClick={retryAnalysis}
                  disabled={loadingAnalysis}
                  className="px-3 py-1 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingAnalysis ? 'animate-spin' : ''}`} />
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <div className="flex items-center gap-3">
                <Brain className="w-8 h-8 text-purple-400" />
                <div>
                  <div className="text-sm font-medium text-purple-300">AI Executive Briefing</div>
                  <div className="text-xs text-[#94a3b8]">Analysis will appear here once processing completes.</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1a2744] rounded-xl p-6 border border-[#2d3a52]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[22px] font-semibold text-white flex items-center gap-2">
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
                <span className="text-[#64748b]">Date Column: {preview.schedule?.dateColumn || 'auto'}</span>
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

            {/* Station Summary — collapsible */}
            <CollapsibleSection
              title="Station Status"
              icon={Zap}
              badge={{ text: `${stations.length} stations`, variant: 'gold' }}
              defaultOpen={false}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {stations?.map((station: any) => (
                  <div key={station.station} className="p-2 bg-[#1a2744] rounded flex items-center justify-between">
                    <div>
                      <span className="text-white text-xs block">{station.station}</span>
                      <span className="text-[#64748b] text-xs">{station.unitsOnline}/{station.totalUnits} online</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-medium text-sm ${station.stationUtilizationPct >= 80 ? 'text-green-400' : station.stationUtilizationPct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                        {station.stationUtilizationPct?.toFixed(0) || 0}%
                      </span>
                      <span className="text-[#64748b] text-xs block">{station.totalAvailableMw?.toFixed(1)} MW</span>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-amber-500/20 rounded-lg">
                <div className="text-[#94a3b8] text-sm">Fossil Capacity</div>
                <div className="text-xl font-bold text-amber-400">
                  {summary?.totalFossilFuelCapacityMw?.toFixed(1) || '\u2014'} MW
                </div>
              </div>
              <div className="p-3 bg-blue-500/20 rounded-lg">
                <div className="text-[#94a3b8] text-sm">Expected Peak</div>
                <div className="text-xl font-bold text-blue-400">
                  {summary?.expectedPeakDemandMw?.toFixed(1) || '\u2014'} MW
                </div>
              </div>
              <div className="p-3 bg-cyan-500/20 rounded-lg">
                <div className="text-[#94a3b8] text-sm">Reserve</div>
                <div className="text-xl font-bold text-cyan-400">
                  {summary?.reserveCapacityMw?.toFixed(1) || '\u2014'} MW
                </div>
              </div>
              <div className="p-3 bg-[#2d3a52]/50 rounded-lg">
                <div className="text-[#94a3b8] text-sm">DBIS Capacity</div>
                <div className="text-xl font-bold text-white">
                  {summary?.totalDbisCapacityMw?.toFixed(1) || '\u2014'} MW
                </div>
              </div>
            </div>

            {/* Peak Demand */}
            {(summary?.eveningPeakOnBarsMw || summary?.dayPeakOnBarsMw) && (
              <div className="p-4 bg-[#2d3a52]/50 rounded-lg">
                <h4 className="text-sm font-medium text-[#94a3b8] mb-3">Peak Demand</h4>
                <div className="grid grid-cols-2 gap-4">
                  {summary?.eveningPeakOnBarsMw && (
                    <div>
                      <div className="text-xs text-[#64748b]">Evening Peak</div>
                      <div className="text-lg font-semibold text-white">
                        {summary.eveningPeakOnBarsMw?.toFixed(1)} MW
                        {summary.eveningPeakSuppressedMw && (
                          <span className="text-sm text-[#94a3b8] ml-1">
                            ({summary.eveningPeakSuppressedMw?.toFixed(1)} suppressed)
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {summary?.dayPeakOnBarsMw && (
                    <div>
                      <div className="text-xs text-[#64748b]">Day Peak</div>
                      <div className="text-lg font-semibold text-white">
                        {summary.dayPeakOnBarsMw?.toFixed(1)} MW
                        {summary.dayPeakSuppressedMw && (
                          <span className="text-sm text-[#94a3b8] ml-1">
                            ({summary.dayPeakSuppressedMw?.toFixed(1)} suppressed)
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Solar Data — collapsible */}
            <CollapsibleSection
              title="Renewable Capacity"
              icon={Sun}
              defaultOpen={false}
            >
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
            </CollapsibleSection>

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
