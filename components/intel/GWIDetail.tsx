'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  DollarSign, Receipt, Users, ShieldAlert, ShoppingCart, Package,
  Upload, RefreshCw, Calendar, ChevronDown, AlertTriangle, FileText,
  TrendingUp, TrendingDown, Scale, Loader2,
} from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { InsightCard, type InsightCardData } from '@/components/ui/InsightCard';
import { HealthScoreTooltip } from '@/components/ui/HealthScoreTooltip';
import { HealthBreakdownSection } from '@/components/ui/HealthBreakdownSection';
import { computeGWIHealth } from '@/lib/agency-health';
import { GWIDocUpload } from './GWIDocUpload';
import type { GWIInsights } from '@/lib/gwi-insights';

// ── Types ───────────────────────────────────────────────────────────────────

interface FinancialData {
  net_profit?: number;
  net_profit_budget?: number;
  net_profit_variance_pct?: number;
  total_revenue?: number;
  total_revenue_budget?: number;
  tariff_revenue?: number;
  other_operating_revenue?: number;
  non_operating_revenue?: number;
  operating_cost?: number;
  operating_cost_budget?: number;
  employment_cost?: number;
  premises_cost?: number;
  supplies_services?: number;
  transport_cost?: number;
  admin_cost?: number;
  depreciation?: number;
  govt_subvention?: number;
  cash_at_bank?: number;
  net_assets?: number;
  property_equipment?: number;
  work_in_progress?: number;
  current_assets?: number;
  current_liabilities?: number;
  trade_payables?: number;
  gpl_liability?: number;
}

interface CollectionsData {
  total_collections?: number;
  ytd_collections?: number;
  total_billings?: number;
  active_accounts?: number;
  accounts_receivable?: number;
  on_time_payment_pct?: number;
  region_1_collections?: number;
  region_2_collections?: number;
  region_3_collections?: number;
  region_4_collections?: number;
  region_5_collections?: number;
  billing_efficiency_pct?: number;
  arrears_30_days?: number;
  arrears_60_days?: number;
  arrears_90_plus_days?: number;
}

interface CustomerServiceData {
  total_complaints?: number;
  resolved_complaints?: number;
  resolution_rate_pct?: number;
  within_timeline_pct?: number;
  unresolved_complaints?: number;
  avg_resolution_days?: number;
  disconnections?: number;
  reconnections?: number;
  reconnection_payments?: number;
  legal_actions?: number;
  enforcement_actions?: number;
  puc_complaints?: number;
  puc_resolved?: number;
}

interface ProcurementData {
  total_purchases?: number;
  gog_funded?: number;
  gog_funded_pct?: number;
  gwi_funded?: number;
  gwi_funded_pct?: number;
  major_contracts_count?: number;
  major_contracts_value?: number;
  minor_contracts_count?: number;
  minor_contracts_value?: number;
  inventory_value?: number;
  inventory_receipts?: number;
  inventory_issues?: number;
  major_contracts_by_type?: Record<string, { count: number; value: number }>;
  minor_contracts_by_type?: Record<string, { count: number; value: number }>;
}

interface MonthlyReport {
  id: string;
  report_month: string;
  financial_data: FinancialData;
  collections_data: CollectionsData;
  customer_service_data: CustomerServiceData;
  procurement_data: ProcurementData;
}

// ── Currency Formatter ──────────────────────────────────────────────────────

function formatGYD(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '--';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatNum(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '--';
  return value.toLocaleString();
}

function formatPct(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '--';
  return `${value.toFixed(1)}%`;
}

// ── Variance Badge ──────────────────────────────────────────────────────────

function VarianceBadge({ actual, budget, label, inverse = false }: {
  actual?: number; budget?: number; label?: string; inverse?: boolean;
}) {
  if (actual == null || budget == null || budget === 0) return null;
  const pct = ((actual - budget) / Math.abs(budget)) * 100;
  const isGood = inverse ? pct < 0 : pct > 0;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
      isGood ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
    }`}>
      {isGood ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(pct).toFixed(0)}% {label || (pct > 0 ? 'above' : 'below')} budget
    </span>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────────────

interface KPICardProps {
  title: string;
  value: string;
  badge?: React.ReactNode;
  status?: 'good' | 'warning' | 'critical' | 'neutral';
}

function KPICard({ title, value, badge, status = 'neutral' }: KPICardProps) {
  const valueColor = {
    good: 'text-emerald-400',
    warning: 'text-amber-400',
    critical: 'text-red-400',
    neutral: 'text-[#f1f5f9]',
  }[status];

  return (
    <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-3 md:p-5">
      <p className="text-[#94a3b8] text-[13px] md:text-[15px] mb-2">{title}</p>
      <p className={`text-xl md:text-[32px] font-bold leading-tight ${valueColor}`}>{value}</p>
      {badge && <div className="mt-2">{badge}</div>}
    </div>
  );
}

// ── Schedule Badge ──────────────────────────────────────────────────────────

function ScheduleBadge({ frequency, lastUpdated }: { frequency: string; lastUpdated?: string }) {
  const isOverdue = useMemo(() => {
    if (!lastUpdated) return true;
    const last = new Date(lastUpdated);
    const now = new Date();
    const daysSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
    return frequency === 'Monthly' ? daysSince > 35 : daysSince > 10;
  }, [frequency, lastUpdated]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs px-2 py-0.5 bg-cyan-500/15 text-cyan-400 rounded-full">{frequency}</span>
      {lastUpdated && (
        <span className={`text-xs ${isOverdue ? 'text-amber-400' : 'text-[#64748b]'}`}>
          {isOverdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
          Updated {new Date(lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      )}
    </div>
  );
}

// ── Contract Table ──────────────────────────────────────────────────────────

function ContractTable({ data, title }: {
  data?: Record<string, { count: number; value: number }>;
  title: string;
}) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div>
      <p className="text-[#94a3b8] text-sm font-medium mb-2">{title}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2d3a52]">
            <th className="text-left py-2 text-[#64748b] font-medium">Type</th>
            <th className="text-right py-2 text-[#64748b] font-medium">Count</th>
            <th className="text-right py-2 text-[#64748b] font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(data).map(([type, info]) => (
            <tr key={type} className="border-b border-[#2d3a52]/30">
              <td className="py-2 text-[#f1f5f9] capitalize">{type}</td>
              <td className="py-2 text-right text-[#94a3b8]">{info.count}</td>
              <td className="py-2 text-right text-[#f1f5f9] font-medium">{formatGYD(info.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
  const handleRegenerate = async () => {
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
  };

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
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#d4af37] animate-spin" />
          <p className="text-[#94a3b8] text-[15px]">Loading GWI data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (fetchError && !report) {
    return (
      <div className="bg-[#1a2744] rounded-xl border border-red-500/30 p-6 md:p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h3 className="text-[#f1f5f9] text-lg font-semibold mb-2">Failed to Load GWI Data</h3>
        <p className="text-[#64748b] text-base mb-6 max-w-md mx-auto">{fetchError}</p>
        <button
          onClick={() => setSelectedMonth('')}
          className="px-6 py-3 bg-[#d4af37] text-[#0a1628] rounded-lg font-medium hover:bg-[#c5a030] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // No data state
  if (!report) {
    return (
      <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-6 md:p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#2d3a52] flex items-center justify-center mx-auto mb-4">
          <Upload className="w-8 h-8 text-[#64748b]" />
        </div>
        <h3 className="text-[#f1f5f9] text-lg font-semibold mb-2">No GWI Data Available</h3>
        <p className="text-[#64748b] text-base mb-6 max-w-md mx-auto">
          Upload GWI management, CSCR, or procurement reports to populate the dashboard.
        </p>
        <button
          onClick={() => setShowUpload(true)}
          className="px-6 py-3 bg-[#d4af37] text-[#0a1628] rounded-lg font-medium hover:bg-[#c5a030] transition-colors"
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
      {/* ═══════════════════ TOP SECTION ═══════════════════ */}
      <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-3 md:p-5">
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
              <div className="w-20 h-20 md:w-[100px] md:h-[100px] flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-[#64748b] animate-spin" />
              </div>
            ) : null}

            {/* Center: Headline */}
            <div className="min-w-0 flex-1">
              {insights?.overall?.headline ? (
                <>
                  <p className="text-[10px] uppercase tracking-widest text-[#d4af37] font-semibold mb-1">AI Analysis</p>
                  <p className="text-base md:text-[20px] font-bold text-[#f1f5f9] leading-snug line-clamp-3 md:line-clamp-none">
                    {insights.overall.headline}
                  </p>
                  {insights.overall.summary && (
                    <p className="text-[#94a3b8] text-[15px] mt-1 leading-relaxed line-clamp-2 md:line-clamp-none">{insights.overall.summary}</p>
                  )}
                </>
              ) : (
                <p className="text-[#94a3b8] text-[15px]">GWI Report — {reportMonthStr}</p>
              )}
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {availableMonths.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#64748b]" />
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-[#0a1628] text-[#94a3b8] text-sm border border-[#2d3a52] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#d4af37]"
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
              className="px-3 py-1.5 bg-[#2d3a52] hover:bg-[#3d4a62] text-[#94a3b8] rounded-lg text-sm flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
            {insights && (
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="px-3 py-1.5 bg-[#2d3a52] hover:bg-[#3d4a62] text-[#94a3b8] rounded-lg text-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Health Breakdown — full-width below the header row so it doesn't inflate gauge column width */}
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
                        <li key={i} className="text-[#94a3b8] text-sm flex items-start gap-2">
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
                        <li key={i} className="text-[#94a3b8] text-sm flex items-start gap-2">
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

      {/* ═══════════════════ TAB BAR ═══════════════════ */}
      <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-1.5">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-2 md:px-4 py-2 md:py-2.5 rounded-lg text-xs md:text-base font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-[#d4af37] text-[#0a1628] shadow-lg shadow-[#d4af37]/20'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#2d3a52]'
              }`}
            >
              <span className="md:hidden">{tab.label}</span>
              <span className="hidden md:inline">{tab.fullLabel}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════ TAB CONTENT ═══════════════════ */}
      <div ref={swipeRef} className="min-h-[400px]">

        {/* ────────── TAB 1: FINANCIAL OVERVIEW ────────── */}
        {activeTab === 'financial' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[#f1f5f9] font-medium text-lg md:text-[22px]">Financial Overview</h3>
              <ScheduleBadge frequency="Monthly" lastUpdated={report.report_month} />
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <KPICard
                title="Net Profit/Loss"
                value={formatGYD(fin.net_profit)}
                status={fin.net_profit && fin.net_profit > 0 ? 'good' : 'critical'}
                badge={<VarianceBadge actual={fin.net_profit} budget={fin.net_profit_budget} />}
              />
              <KPICard
                title="Total Revenue"
                value={formatGYD(fin.total_revenue)}
                badge={<VarianceBadge actual={fin.total_revenue} budget={fin.total_revenue_budget} />}
              />
              <KPICard
                title="Operating Cost"
                value={formatGYD(fin.operating_cost)}
                status={fin.operating_cost != null && fin.operating_cost_budget != null && fin.operating_cost < fin.operating_cost_budget ? 'good' : 'warning'}
                badge={<VarianceBadge actual={fin.operating_cost} budget={fin.operating_cost_budget} inverse label="vs budget" />}
              />
              <KPICard
                title="Govt Subvention"
                value={formatGYD(fin.govt_subvention)}
              />
              <KPICard
                title="Cash at Bank"
                value={formatGYD(fin.cash_at_bank)}
                status="good"
              />
              <KPICard
                title="Net Assets"
                value={formatGYD(fin.net_assets)}
              />
            </div>

            {/* Revenue Breakdown */}
            <CollapsibleSection
              title="Revenue Breakdown"
              icon={DollarSign}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#0a1628] rounded-lg p-3 md:p-4 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-sm mb-1">Tariff Revenue</p>
                  <p className="text-lg md:text-xl font-bold text-[#f1f5f9]">{formatGYD(fin.tariff_revenue)}</p>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3 md:p-4 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-sm mb-1">Other Operating Revenue</p>
                  <p className="text-lg md:text-xl font-bold text-[#f1f5f9]">{formatGYD(fin.other_operating_revenue)}</p>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3 md:p-4 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-sm mb-1">Non-Operating Revenue</p>
                  <p className="text-lg md:text-xl font-bold text-[#f1f5f9]">{formatGYD(fin.non_operating_revenue)}</p>
                </div>
              </div>
            </CollapsibleSection>

            {/* Cost Breakdown */}
            <CollapsibleSection
              title="Cost Breakdown"
              icon={Receipt}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Employment', value: fin.employment_cost },
                  { label: 'Premises', value: fin.premises_cost },
                  { label: 'Supplies & Services', value: fin.supplies_services },
                  { label: 'Transport', value: fin.transport_cost },
                  { label: 'Administration', value: fin.admin_cost },
                  { label: 'Depreciation', value: fin.depreciation },
                ].map(item => (
                  <div key={item.label} className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                    <p className="text-[#64748b] text-xs mb-1">{item.label}</p>
                    <p className="text-lg font-bold text-[#f1f5f9]">{formatGYD(item.value)}</p>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Balance Sheet */}
            <CollapsibleSection
              title="Balance Sheet"
              icon={Scale}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Net Assets', value: fin.net_assets },
                  { label: 'Property & Equipment', value: fin.property_equipment },
                  { label: 'Work in Progress', value: fin.work_in_progress },
                  { label: 'Current Assets', value: fin.current_assets },
                  { label: 'Current Liabilities', value: fin.current_liabilities },
                  { label: 'Trade Payables', value: fin.trade_payables },
                  { label: 'GPL Liability', value: fin.gpl_liability },
                  { label: 'Cash at Bank', value: fin.cash_at_bank },
                ].map(item => (
                  <div key={item.label} className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                    <p className="text-[#64748b] text-xs mb-1">{item.label}</p>
                    <p className="text-lg font-bold text-[#f1f5f9]">{formatGYD(item.value)}</p>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* AI Insight */}
            {insights?.financial && (
              <InsightCard
                card={{
                  emoji: '\uD83D\uDCB0',
                  title: insights.financial.headline || 'Financial Analysis',
                  severity: insights.financial.severity || 'stable',
                  summary: insights.financial.summary || '',
                  detail: insights.financial.recommendations?.join('\n') || null,
                }}
              />
            )}
          </div>
        )}

        {/* ────────── TAB 2: COLLECTIONS & BILLING ────────── */}
        {activeTab === 'collections' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[#f1f5f9] font-medium text-lg md:text-[22px]">Collections & Billing</h3>
              <ScheduleBadge frequency="Monthly" lastUpdated={report.report_month} />
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <KPICard
                title="Total Collections"
                value={formatGYD(coll.total_collections)}
                status="good"
              />
              <KPICard
                title="YTD Collections"
                value={formatGYD(coll.ytd_collections)}
              />
              <KPICard
                title="Total Billings"
                value={formatGYD(coll.total_billings)}
              />
              <KPICard
                title="Active Accounts"
                value={formatNum(coll.active_accounts)}
              />
              <KPICard
                title="Accounts Receivable"
                value={formatGYD(coll.accounts_receivable)}
                status={coll.accounts_receivable && coll.accounts_receivable > 2_000_000_000 ? 'warning' : 'neutral'}
              />
              <KPICard
                title="On-time Payments"
                value={formatPct(coll.on_time_payment_pct)}
                status={coll.on_time_payment_pct != null && coll.on_time_payment_pct < 50 ? 'critical' : coll.on_time_payment_pct != null && coll.on_time_payment_pct < 70 ? 'warning' : 'good'}
              />
            </div>

            {/* Regional Collections */}
            <CollapsibleSection
              title="Regional Collections"
              icon={DollarSign}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: 'Region 1', value: coll.region_1_collections },
                  { label: 'Region 2', value: coll.region_2_collections },
                  { label: 'Region 3', value: coll.region_3_collections },
                  { label: 'Region 4', value: coll.region_4_collections },
                  { label: 'Region 5', value: coll.region_5_collections },
                ].map(item => (
                  <div key={item.label} className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                    <p className="text-[#64748b] text-xs mb-1">{item.label}</p>
                    <p className="text-lg font-bold text-[#f1f5f9]">{formatGYD(item.value)}</p>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Billing Performance */}
            <CollapsibleSection
              title="Billing Performance"
              icon={FileText}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">Billing Efficiency</p>
                  <p className="text-lg font-bold text-[#f1f5f9]">{formatPct(coll.billing_efficiency_pct)}</p>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">Active Accounts</p>
                  <p className="text-lg font-bold text-[#f1f5f9]">{formatNum(coll.active_accounts)}</p>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">On-time Payment Rate</p>
                  <p className={`text-lg font-bold ${(coll.on_time_payment_pct ?? 0) < 50 ? 'text-red-400' : 'text-[#f1f5f9]'}`}>
                    {formatPct(coll.on_time_payment_pct)}
                  </p>
                </div>
              </div>
            </CollapsibleSection>

            {/* Arrears Recovery */}
            <CollapsibleSection
              title="Arrears Recovery"
              icon={AlertTriangle}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">30-Day Arrears</p>
                  <p className="text-lg font-bold text-amber-400">{formatGYD(coll.arrears_30_days)}</p>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">60-Day Arrears</p>
                  <p className="text-lg font-bold text-amber-400">{formatGYD(coll.arrears_60_days)}</p>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">90+ Day Arrears</p>
                  <p className="text-lg font-bold text-red-400">{formatGYD(coll.arrears_90_plus_days)}</p>
                </div>
              </div>
            </CollapsibleSection>

            {/* AI Insight */}
            {insights?.operational && (
              <InsightCard
                card={{
                  emoji: '\uD83D\uDCCA',
                  title: insights.operational.headline || 'Collections Analysis',
                  severity: insights.operational.severity || 'stable',
                  summary: insights.operational.summary || '',
                  detail: insights.operational.recommendations?.join('\n') || null,
                }}
              />
            )}
          </div>
        )}

        {/* ────────── TAB 3: CUSTOMER SERVICE ────────── */}
        {activeTab === 'customer_service' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[#f1f5f9] font-medium text-lg md:text-[22px]">Customer Service</h3>
              <ScheduleBadge frequency="Monthly" lastUpdated={report.report_month} />
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <KPICard
                title="Complaints"
                value={formatNum(cs.total_complaints)}
              />
              <KPICard
                title="Resolved"
                value={`${formatNum(cs.resolved_complaints)} / ${formatPct(cs.resolution_rate_pct)}`}
                status={(cs.resolution_rate_pct ?? 0) >= 85 ? 'good' : 'warning'}
              />
              <KPICard
                title="Within Timeline"
                value={formatPct(cs.within_timeline_pct)}
                status={(cs.within_timeline_pct ?? 0) >= 80 ? 'good' : (cs.within_timeline_pct ?? 0) >= 60 ? 'warning' : 'critical'}
              />
              <KPICard
                title="Unresolved"
                value={formatNum(cs.unresolved_complaints)}
                status={(cs.unresolved_complaints ?? 0) > 200 ? 'critical' : (cs.unresolved_complaints ?? 0) > 100 ? 'warning' : 'good'}
              />
              <KPICard
                title="Disconnections"
                value={formatNum(cs.disconnections)}
              />
              <KPICard
                title="Reconnections"
                value={formatNum(cs.reconnections)}
                status={(cs.reconnections ?? 0) > (cs.disconnections ?? 0) ? 'good' : 'warning'}
              />
            </div>

            {/* Resolution Performance */}
            <CollapsibleSection
              title="Resolution Performance"
              icon={ShieldAlert}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">Total Complaints</p>
                  <p className="text-lg font-bold text-[#f1f5f9]">{formatNum(cs.total_complaints)}</p>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">Resolution Rate</p>
                  <p className="text-lg font-bold text-emerald-400">{formatPct(cs.resolution_rate_pct)}</p>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">Avg Resolution Time</p>
                  <p className="text-lg font-bold text-[#f1f5f9]">{cs.avg_resolution_days ?? '--'} days</p>
                </div>
              </div>
            </CollapsibleSection>

            {/* Arrears Actions */}
            <CollapsibleSection
              title="Arrears Actions"
              icon={Users}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">Reconnection Payments</p>
                  <p className="text-lg font-bold text-[#f1f5f9]">{formatGYD(cs.reconnection_payments)}</p>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">Legal Actions</p>
                  <p className="text-lg font-bold text-amber-400">{cs.legal_actions ?? '--'}</p>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">Enforcement Actions</p>
                  <p className="text-lg font-bold text-amber-400">{cs.enforcement_actions ?? '--'}</p>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">Disconnections</p>
                  <p className="text-lg font-bold text-red-400">{formatNum(cs.disconnections)}</p>
                </div>
              </div>
            </CollapsibleSection>

            {/* PUC Matters */}
            <CollapsibleSection
              title="PUC Matters"
              icon={FileText}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">PUC Complaints</p>
                  <p className="text-lg font-bold text-[#f1f5f9]">{cs.puc_complaints ?? '--'}</p>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">PUC Resolved</p>
                  <p className="text-lg font-bold text-emerald-400">{cs.puc_resolved ?? '--'}</p>
                </div>
              </div>
            </CollapsibleSection>

            {/* AI Insight */}
            {insights?.customer_service && (
              <InsightCard
                card={{
                  emoji: '\uD83D\uDC65',
                  title: insights.customer_service.headline || 'Customer Service Analysis',
                  severity: insights.customer_service.severity || 'stable',
                  summary: insights.customer_service.summary || '',
                  detail: insights.customer_service.recommendations?.join('\n') || null,
                }}
              />
            )}
          </div>
        )}

        {/* ────────── TAB 4: PROCUREMENT ────────── */}
        {activeTab === 'procurement' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[#f1f5f9] font-medium text-lg md:text-[22px]">Procurement</h3>
              <ScheduleBadge frequency="Monthly" lastUpdated={report.report_month} />
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <KPICard
                title="Total Purchases"
                value={formatGYD(proc.total_purchases)}
              />
              <KPICard
                title="GOG Funded"
                value={`${formatGYD(proc.gog_funded)} / ${formatPct(proc.gog_funded_pct)}`}
              />
              <KPICard
                title="GWI Funded"
                value={`${formatGYD(proc.gwi_funded)} / ${formatPct(proc.gwi_funded_pct)}`}
              />
              <KPICard
                title="Major Contracts"
                value={`${proc.major_contracts_count ?? '--'} @ ${formatGYD(proc.major_contracts_value)}`}
              />
              <KPICard
                title="Minor Contracts"
                value={`${proc.minor_contracts_count ?? '--'} @ ${formatGYD(proc.minor_contracts_value)}`}
              />
              <KPICard
                title="Inventory"
                value={formatGYD(proc.inventory_value)}
              />
            </div>

            {/* Major Contracts */}
            <CollapsibleSection
              title="Major Contracts"
              icon={ShoppingCart}
              defaultOpen={false}
              badge={{ text: `${proc.major_contracts_count ?? 0}`, variant: 'gold' }}
            >
              <ContractTable data={proc.major_contracts_by_type} title="By Type" />
            </CollapsibleSection>

            {/* Minor Contracts */}
            <CollapsibleSection
              title="Minor Contracts"
              icon={ShoppingCart}
              defaultOpen={false}
              badge={{ text: `${proc.minor_contracts_count ?? 0}`, variant: 'info' }}
            >
              <ContractTable data={proc.minor_contracts_by_type} title="By Type" />
            </CollapsibleSection>

            {/* Inventory */}
            <CollapsibleSection
              title="Inventory"
              icon={Package}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">Total Inventory Value</p>
                  <p className="text-lg font-bold text-[#f1f5f9]">{formatGYD(proc.inventory_value)}</p>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">Receipts</p>
                  <p className="text-lg font-bold text-emerald-400">{formatGYD(proc.inventory_receipts)}</p>
                </div>
                <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52]">
                  <p className="text-[#64748b] text-xs mb-1">Issues</p>
                  <p className="text-lg font-bold text-amber-400">{formatGYD(proc.inventory_issues)}</p>
                </div>
              </div>
            </CollapsibleSection>

            {/* AI Insight */}
            {insights?.procurement && (
              <InsightCard
                card={{
                  emoji: '\uD83D\uDCE6',
                  title: insights.procurement.headline || 'Procurement Analysis',
                  severity: insights.procurement.severity || 'stable',
                  summary: insights.procurement.summary || '',
                  detail: insights.procurement.recommendations?.join('\n') || null,
                }}
              />
            )}
          </div>
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
