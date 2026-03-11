'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  Upload, RefreshCw, Calendar, AlertTriangle, Loader2,
} from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { HealthScoreTooltip } from '@/components/ui/HealthScoreTooltip';
import { HealthBreakdownSection } from '@/components/ui/HealthBreakdownSection';
import { computeGWIHealth } from '@/lib/agency-health';
import { GWIDocUpload } from './GWIDocUpload';
import { GWIOverviewTab } from './gwi/GWIOverviewTab';
import { GWIMetricsTab } from './gwi/GWIMetricsTab';
import { GWITrendsTab } from './gwi/GWITrendsTab';
import type { FinancialData } from './gwi/GWIOverviewTab';
import type { CollectionsData, CustomerServiceData } from './gwi/GWIMetricsTab';
import type { ProcurementData } from './gwi/GWITrendsTab';
import type { GWIInsights } from '@/lib/gwi-insights';

// ── Types ───────────────────────────────────────────────────────────────────

interface MonthlyReport {
  id: string;
  report_month: string;
  financial_data: FinancialData;
  collections_data: CollectionsData;
  customer_service_data: CustomerServiceData;
  procurement_data: ProcurementData;
}

// ── Main Component ──────────────────────────────────────────────────────────

export function GWIDetail() {
  // State
  const [activeTab, setActiveTab] = useState('financial');
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [insights, setInsights] = useState<GWIInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

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
  }, [selectedMonth]);

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

  // Fetch available months (all distinct report_month values)
  useEffect(() => {
    async function fetchMonths() {
      try {
        const res = await fetch('/api/gwi/report/latest');
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.data?.report_month) {
          setAvailableMonths([json.data.report_month]);
        }
      } catch {
        // ignore
      }
    }
    fetchMonths();
  }, []);

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

  // Data aliases
  const fin = report?.financial_data || {} as FinancialData;
  const coll = report?.collections_data || {} as CollectionsData;
  const cs = report?.customer_service_data || {} as CustomerServiceData;
  const proc = report?.procurement_data || {} as ProcurementData;

  // Tabs — memoized to prevent re-render cascades in swipe handlers
  const tabs = useMemo(() => [
    { id: 'financial', label: 'Financial', fullLabel: 'Financial Overview' },
    { id: 'collections', label: 'Collections', fullLabel: 'Collections & Billing' },
    { id: 'customer_service', label: 'Service', fullLabel: 'Customer Service' },
    { id: 'procurement', label: 'Procurement', fullLabel: 'Procurement' },
  ], []);

  // Swipe gesture for mobile tab navigation
  const isMobile = useIsMobile();
  const handleSwipeLeft = useCallback(() => {
    setActiveTab(prev => {
      const idx = tabs.findIndex(t => t.id === prev);
      return idx < tabs.length - 1 ? tabs[idx + 1].id : prev;
    });
  }, [tabs]);
  const handleSwipeRight = useCallback(() => {
    setActiveTab(prev => {
      const idx = tabs.findIndex(t => t.id === prev);
      return idx > 0 ? tabs[idx - 1].id : prev;
    });
  }, [tabs]);
  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    enabled: isMobile,
  });

  // Loading state
  if (loading && !report) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="bg-navy-900 rounded-xl border border-navy-800 p-5">
          <div className="flex items-center gap-5">
            <div className="w-[100px] h-[100px] rounded-full bg-navy-800 shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="h-5 bg-navy-800 rounded w-48" />
              <div className="h-4 bg-navy-800 rounded w-full max-w-md" />
              <div className="h-4 bg-navy-800 rounded w-2/3" />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 bg-navy-800 rounded-lg w-28" />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-premium p-4">
              <div className="h-4 bg-navy-800 rounded w-24 mb-2" />
              <div className="h-6 bg-navy-800 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
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

  // No data state
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
            reportPeriod={new Date().toISOString().slice(0, 7)}
            onClose={() => setShowUpload(false)}
            onSaved={() => setSelectedMonth('')}
          />
        )}
      </div>
    );
  }

  const reportMonthStr = report.report_month
    ? new Date(report.report_month + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="space-y-4">
      {/* Top Section: Health Score + Controls */}
      <div className="bg-navy-900 rounded-xl border border-navy-800 p-3 md:p-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          {/* Left: Health Score Gauge */}
          <div className="flex items-center gap-5 w-full md:flex-1 md:min-w-0">
            {gwiHealth ? (
              <div className="flex-shrink-0">
                <HealthScoreTooltip score={gwiHealth.score} severity={gwiHealth.severity} breakdown={gwiHealth.breakdown} size={100} />
              </div>
            ) : insights?.overall?.health_score != null ? (
              <div className="flex-shrink-0">
                <HealthScoreTooltip score={insights.overall.health_score} size={100} />
              </div>
            ) : insightsLoading ? (
              <div className="w-20 h-20 md:w-[100px] md:h-[100px] flex items-center justify-center" role="status" aria-label="Loading">
                <Loader2 className="w-6 h-6 text-navy-600 animate-spin" aria-hidden="true" />
              </div>
            ) : null}

            {/* Center: Headline */}
            <div className="min-w-0 flex-1">
              {insights?.overall?.headline ? (
                <>
                  <p className="text-[10px] uppercase tracking-widest text-gold-500 font-semibold mb-1">AI Analysis</p>
                  <p className="text-base md:text-[20px] font-bold text-slate-100 leading-snug line-clamp-3 md:line-clamp-none">
                    {insights.overall.headline}
                  </p>
                  {insights.overall.summary && (
                    <p className="text-slate-400 text-[15px] mt-1 leading-relaxed line-clamp-2 md:line-clamp-none">{insights.overall.summary}</p>
                  )}
                </>
              ) : (
                <p className="text-slate-400 text-[15px]">GWI Report — {reportMonthStr}</p>
              )}
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
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
                      {new Date(m + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
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
              Upload
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

        {/* Health Breakdown */}
        {gwiHealth && (
          <HealthBreakdownSection breakdown={gwiHealth.breakdown} score={gwiHealth.score} label={gwiHealth.label} severity={gwiHealth.severity} />
        )}

        {/* Cross-Cutting Issues */}
        {insights?.cross_cutting && (insights.cross_cutting.issues.length > 0 || insights.cross_cutting.opportunities.length > 0) && (
          <div className="mt-4">
            <CollapsibleSection
              title="Cross-Cutting Issues"
              icon={AlertTriangle}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.cross_cutting.issues.length > 0 && (
                  <div>
                    <p className="text-amber-400 text-sm font-medium mb-2">Issues</p>
                    <ul className="space-y-1.5">
                      {insights.cross_cutting.issues.map((issue, i) => (
                        <li key={i} className="text-slate-400 text-sm flex items-start gap-2">
                          <span className="text-amber-400 mt-0.5">•</span>
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {insights.cross_cutting.opportunities.length > 0 && (
                  <div>
                    <p className="text-emerald-400 text-sm font-medium mb-2">Opportunities</p>
                    <ul className="space-y-1.5">
                      {insights.cross_cutting.opportunities.map((opp, i) => (
                        <li key={i} className="text-slate-400 text-sm flex items-start gap-2">
                          <span className="text-emerald-400 mt-0.5">•</span>
                          {opp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="bg-navy-900 rounded-xl border border-navy-800 p-1.5">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-2 md:px-4 py-2 md:py-2.5 rounded-lg text-xs md:text-base font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-gold-500 text-navy-950 shadow-lg shadow-gold-500/20'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-navy-800'
              }`}
            >
              <span className="md:hidden">{tab.label}</span>
              <span className="hidden md:inline">{tab.fullLabel}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div ref={swipeRef} className="min-h-[400px]">
        {activeTab === 'financial' && (
          <GWIOverviewTab
            fin={fin}
            insights={insights}
            reportMonth={report.report_month}
          />
        )}

        {(activeTab === 'collections' || activeTab === 'customer_service') && (
          <GWIMetricsTab
            activeTab={activeTab}
            coll={coll}
            cs={cs}
            insights={insights}
            reportMonth={report.report_month}
          />
        )}

        {activeTab === 'procurement' && (
          <GWITrendsTab
            proc={proc}
            insights={insights}
            reportMonth={report.report_month}
          />
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <GWIDocUpload
          reportPeriod={selectedMonth ? selectedMonth.slice(0, 7) : new Date().toISOString().slice(0, 7)}
          onClose={() => setShowUpload(false)}
          onSaved={() => {
            // Refresh data after save
            setSelectedMonth(prev => {
              // Force re-fetch by toggling
              setTimeout(() => setSelectedMonth(prev), 100);
              return '';
            });
          }}
        />
      )}
    </div>
  );
}
