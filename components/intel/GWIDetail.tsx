'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Upload, RefreshCw, Calendar, AlertTriangle, Loader2,
} from 'lucide-react';
import { safeDateParse } from '@/lib/format';
import { formatGYD, formatPct, hasValue } from '@/lib/gwi-metric-display';
import { HealthScoreGauge } from '@/components/ui/HealthScoreGauge';
import { computeGWIHealth } from '@/lib/agency-health';
import { GWIDocUpload } from './GWIDocUpload';
import { SignalCard, thresholdStatus } from './gwi/DomainCard';
import { FinancialDomain } from './gwi/GWIOverviewTab';
import { CollectionsDomain, CustomerServiceDomain } from './gwi/GWIMetricsTab';
import { ProcurementDomain } from './gwi/GWITrendsTab';
import type { FinancialData, CollectionsData, CustomerServiceData, ProcurementData, MonthlyReport } from './gwi/gwi-types';
import type { GWIInsights } from '@/lib/gwi-insights';

// Stable empty sentinels — prevent new object creation on every render
const EMPTY_FIN: FinancialData = {};
const EMPTY_COLL: CollectionsData = {};
const EMPTY_CS: CustomerServiceData = {};
const EMPTY_PROC: ProcurementData = {};

// ── Main Component ──────────────────────────────────────────────────────────

export function GWIDetail() {
  // State
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [insights, setInsights] = useState<GWIInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Compute health score with breakdown
  const gwiHealth = useMemo(
    () => report ? computeGWIHealth(report) : null,
    [report]
  );

  // Fetch report data
  useEffect(() => {
    let cancelled = false;
    async function fetchReport() {
      setLoading(true);
      setFetchError(null);
      try {
        const url = selectedMonth
          ? `/api/gwi/report/${selectedMonth}`
          : '/api/gwi/report/latest';
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.success && json.data) {
          setReport(json.data);
          if (!selectedMonth && json.data.report_month) {
            setSelectedMonth(json.data.report_month);
          }
          if (json.availableMonths) {
            setAvailableMonths(json.availableMonths);
          }
        } else {
          setReport(null);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch GWI report:', err);
        setFetchError(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchReport();
    return () => { cancelled = true; };
  }, [selectedMonth, refreshKey]);

  // Fetch insights
  useEffect(() => {
    let cancelled = false;
    async function fetchInsights() {
      setInsightsLoading(true);
      try {
        const url = selectedMonth
          ? `/api/gwi/insights/${selectedMonth}`
          : '/api/gwi/insights/latest';
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.success && json.data) {
          setInsights(json.data);
        } else {
          setInsights(null);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch GWI insights:', err);
      } finally {
        if (!cancelled) setInsightsLoading(false);
      }
    }
    fetchInsights();
    return () => { cancelled = true; };
  }, [selectedMonth]);

  // Regenerate AI insights
  const handleRegenerate = useCallback(async () => {
    if (!selectedMonth) return;
    setRegenerating(true);
    try {
      const res = await fetch('/api/gwi/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, forceRegenerate: true }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setInsights(json.data);
      }
    } catch (err) {
      console.error('Failed to regenerate insights:', err);
    } finally {
      setRegenerating(false);
    }
  }, [selectedMonth]);

  // Default upload period: previous month
  const defaultUploadPeriod = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  }, []);

  // Reset to latest after upload
  const handleUploadSaved = useCallback(() => {
    setSelectedMonth('');
    setRefreshKey(k => k + 1);
  }, []);

  // Data aliases (stable refs when data is missing)
  const fin = report?.financial_data || EMPTY_FIN;
  const coll = report?.collections_data || EMPTY_COLL;
  const cs = report?.customer_service_data || EMPTY_CS;
  const proc = report?.procurement_data || EMPTY_PROC;

  // Health score value (prefer computed, fall back to AI)
  const healthScore = gwiHealth?.score ?? insights?.overall?.health_score ?? null;

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading && !report) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="bg-navy-900 rounded-xl border border-navy-800 p-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-navy-800 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-navy-800 rounded w-full max-w-lg" />
              <div className="h-3 bg-navy-800 rounded w-2/3" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-navy-900 rounded-xl border border-navy-800 p-4">
              <div className="h-3 bg-navy-800 rounded w-20 mb-2" />
              <div className="h-6 bg-navy-800 rounded w-16" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-navy-900 rounded-xl border border-navy-800 p-4 h-48" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (fetchError && !report) {
    return (
      <div className="bg-navy-900 rounded-xl border border-red-500/30 p-6 md:p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h3 className="text-slate-100 text-lg font-semibold mb-2">Failed to Load GWI Data</h3>
        <p className="text-navy-600 text-base mb-6 max-w-md mx-auto">{fetchError}</p>
        <button
          onClick={() => setSelectedMonth('')}
          className="px-6 py-3 bg-gold-500 text-navy-950 rounded-lg font-medium hover:bg-[#c5a030] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── No data state ──────────────────────────────────────────────────────────

  if (!report) {
    return (
      <div className="bg-navy-900 rounded-xl border border-navy-800 p-6 md:p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-navy-800 flex items-center justify-center mx-auto mb-4">
          <Upload className="w-8 h-8 text-navy-600" />
        </div>
        <h3 className="text-slate-100 text-lg font-semibold mb-2">No GWI Data Available</h3>
        <p className="text-navy-600 text-base mb-6 max-w-md mx-auto">
          Upload GWI management, CSCR, or procurement reports to populate the dashboard.
        </p>
        <button
          onClick={() => setShowUpload(true)}
          className="px-6 py-3 bg-gold-500 text-navy-950 rounded-lg font-medium hover:bg-[#c5a030] transition-colors"
        >
          Upload Reports
        </button>
        {showUpload && (
          <GWIDocUpload
            reportPeriod={defaultUploadPeriod}
            onClose={() => setShowUpload(false)}
            onSaved={handleUploadSaved}
          />
        )}
      </div>
    );
  }

  // ── Alert text: best single-line cross-domain finding ──────────────────────

  const alertText = insights?.overall?.headline
    || (report.report_month
      ? `GWI Report \u2014 ${safeDateParse(report.report_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
      : 'GWI Report');

  // ── Signal row metric statuses ─────────────────────────────────────────────

  const profitStatus = !hasValue(fin.net_profit) ? 'muted' as const
    : (fin.net_profit > 0 ? 'good' as const : 'critical' as const);
  const collectionStatus = thresholdStatus(coll.billing_efficiency_pct, 90, 70);
  const resolutionStatus = thresholdStatus(cs.resolution_rate_pct, 85, 70);
  const onTimeStatus = thresholdStatus(coll.on_time_payment_pct, 60, 45);

  return (
    <div className="space-y-4">
      {/* ── Alert Strip: Health Score + Single-Line Insight + Controls ─── */}
      <div className="bg-navy-900 rounded-xl border border-navy-800 p-3 md:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Health Score Badge (compact, inline) */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {healthScore != null ? (
              <div className="flex-shrink-0">
                <HealthScoreGauge score={healthScore} compact />
              </div>
            ) : insightsLoading ? (
              <div className="w-14 h-14 flex items-center justify-center flex-shrink-0" role="status" aria-label="Loading">
                <Loader2 className="w-5 h-5 text-navy-600 animate-spin" aria-hidden="true" />
              </div>
            ) : null}

            {/* Single-line alert text */}
            <p className="text-sm md:text-base font-medium text-slate-100 leading-snug line-clamp-2">
              {alertText}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {availableMonths.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-navy-600" />
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  aria-label="Select report month"
                  className="bg-navy-950 text-slate-400 text-sm border border-navy-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-gold-500"
                >
                  {availableMonths.map(m => (
                    <option key={m} value={m}>
                      {safeDateParse(m).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={() => setShowUpload(true)}
              className="px-3 py-1.5 bg-navy-800 hover:bg-[#3d4a62] text-slate-400 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload</span>
            </button>
            {insights && (
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="px-3 py-1.5 bg-navy-800 hover:bg-[#3d4a62] text-slate-400 rounded-lg text-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
                aria-label="Regenerate analysis"
              >
                <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Signal Row: 4 Cross-Domain Key Metrics ────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SignalCard
          title="Net Profit/Loss"
          value={formatGYD(fin.net_profit)}
          status={profitStatus}
        />
        <SignalCard
          title="Collection Rate"
          value={formatPct(coll.billing_efficiency_pct)}
          status={collectionStatus}
        />
        <SignalCard
          title="Complaint Resolution"
          value={formatPct(cs.resolution_rate_pct)}
          status={resolutionStatus}
        />
        <SignalCard
          title="On-time Payment"
          value={formatPct(coll.on_time_payment_pct)}
          status={onTimeStatus}
        />
      </div>

      {/* ── Domain Grid: 2x2 ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FinancialDomain fin={fin} insights={insights} />
        <CollectionsDomain coll={coll} insights={insights} />
        <CustomerServiceDomain cs={cs} insights={insights} />
        <ProcurementDomain proc={proc} insights={insights} />
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <GWIDocUpload
          reportPeriod={defaultUploadPeriod}
          onClose={() => setShowUpload(false)}
          onSaved={handleUploadSaved}
        />
      )}
    </div>
  );
}
