'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plane, TrendingUp, TrendingDown, Package, Star, Calendar,
  Upload, RefreshCw, Loader2, AlertTriangle, Clock, Shield,
  ChevronDown,
} from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { InsightCard, type InsightCardData } from '@/components/ui/InsightCard';
import { HealthScoreTooltip } from '@/components/ui/HealthScoreTooltip';
import { HealthBreakdownSection } from '@/components/ui/HealthBreakdownSection';
import { computeCJIAHealth } from '@/lib/agency-health';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { CJIAData } from '@/data/mockData';

// ── Types ───────────────────────────────────────────────────────────────────

interface CJIAInsights {
  overall?: {
    health_score?: number;
    headline?: string;
    summary?: string;
  };
  operations?: { cards?: InsightCardData[] };
  passengers?: { cards?: InsightCardData[] };
  revenue?: { cards?: InsightCardData[] };
  projects?: { cards?: InsightCardData[] };
  cross_cutting?: {
    issues: string[];
    opportunities: string[];
  };
}

interface MonthlyEntry {
  month: string;
  arrivals: number;
  departures: number;
  partial?: boolean;
  period?: string;
}

interface MonthlyWithTotals extends MonthlyEntry {
  monthFull: string;
  total: number;
}

interface CJIADetailProps {
  data?: CJIAData;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toLocaleString();
}

function formatPct(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '--';
  return `${value.toFixed(1)}%`;
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ title, value, subtitle, status = 'neutral', badge }: {
  title: string;
  value: string;
  subtitle?: string;
  status?: 'good' | 'warning' | 'critical' | 'neutral';
  badge?: React.ReactNode;
}) {
  const valueColor = {
    good: 'text-emerald-400',
    warning: 'text-amber-400',
    critical: 'text-red-400',
    neutral: 'text-[#f1f5f9]',
  }[status];

  return (
    <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-3 md:p-5">
      <p className="text-[#94a3b8] text-[15px] mb-2">{title}</p>
      <p className={`text-xl md:text-[32px] font-bold leading-tight ${valueColor}`}>{value}</p>
      {badge && <div className="mt-2">{badge}</div>}
      {subtitle && <p className="text-[#64748b] text-sm mt-1">{subtitle}</p>}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function CJIADetail({ data }: CJIADetailProps) {
  // State
  const [activeTab, setActiveTab] = useState('operations');
  const [insights, setInsights] = useState<CJIAInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  // Fetch insights
  useEffect(() => {
    async function fetchInsights() {
      setInsightsLoading(true);
      try {
        const url = selectedMonth
          ? `/api/cjia/insights/${selectedMonth}`
          : '/api/cjia/insights/latest';
        const res = await fetch(url);
        const json = await res.json();
        if (json.success && json.data) {
          setInsights(json.data);
        } else {
          setInsights(null);
        }
      } catch (err) {
        console.error('Failed to fetch CJIA insights:', err);
      } finally {
        setInsightsLoading(false);
      }
    }
    fetchInsights();
  }, [selectedMonth]);

  // Regenerate AI insights
  const handleRegenerate = async () => {
    if (!selectedMonth && !data) return;
    setRegenerating(true);
    try {
      const month = selectedMonth || new Date().toISOString().slice(0, 7);
      const res = await fetch('/api/cjia/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, forceRegenerate: true }),
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

  // Health score from mock data
  const health = useMemo(() => data ? computeCJIAHealth(data) : null, [data]);

  // Derive metrics from mock data
  const historicalData = data?.historicalMonthlyData || {};
  const monthlyData2025: MonthlyEntry[] = historicalData['2025'] || [];

  const metrics = useMemo(() => {
    if (!data) return null;
    const currentTotal = data.mtdTotal || 0;
    const currentArrivals = data.mtdArrivals || 0;
    const currentDepartures = data.mtdDepartures || 0;
    const currentPeriod = data.mtdPeriod || 'January 2026';
    const yoyChange = data.mtdYoyChange || 0;

    const annual2025 = {
      arrivals: data.annual2025Arrivals || monthlyData2025.reduce((sum, m) => sum + m.arrivals, 0),
      departures: data.annual2025Departures || monthlyData2025.reduce((sum, m) => sum + m.departures, 0),
      total: data.annual2025Total || monthlyData2025.reduce((sum, m) => sum + m.arrivals + m.departures, 0),
    };

    const monthlyWithTotals: MonthlyWithTotals[] = monthlyData2025.map((m) => ({
      ...m,
      monthFull: `${m.month} 2025`,
      total: m.arrivals + m.departures,
    }));

    const defaultMonth: MonthlyWithTotals = { month: '', arrivals: 0, departures: 0, monthFull: '', total: 0 };
    const peakMonth = monthlyWithTotals.reduce(
      (max, m) => (m.total > max.total ? m : max),
      monthlyWithTotals[0] || defaultMonth
    );
    const sortedMonths = [...monthlyWithTotals].sort((a, b) => b.total - a.total);
    const dec2025 = monthlyData2025.find((m) => m.month === 'Dec');
    const dec2025Total = dec2025 ? dec2025.arrivals + dec2025.departures : 0;

    return {
      currentPeriod, currentTotal, currentArrivals, currentDepartures, yoyChange,
      annual2025, monthlyWithTotals, sortedMonths, peakMonth,
      maxTotal: peakMonth?.total || 1,
      lastFullMonth: dec2025 ? { month: 'December 2025', total: dec2025Total, arrivals: dec2025.arrivals, departures: dec2025.departures } : null,
    };
  }, [data, monthlyData2025]);

  const tabs = useMemo(() => [
    { id: 'operations', label: 'Ops', fullLabel: 'Operations' },
    { id: 'passengers', label: 'Passengers', fullLabel: 'Passenger Stats' },
    { id: 'revenue', label: 'Revenue', fullLabel: 'Revenue' },
    { id: 'projects', label: 'Projects', fullLabel: 'Projects' },
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

  // Arrival/departure ratio for current month
  const arrivalPercent = metrics && metrics.currentTotal > 0
    ? Math.round((metrics.currentArrivals / metrics.currentTotal) * 100)
    : 50;

  // Loading without any data
  if (!data && insightsLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#d4af37] animate-spin" />
          <p className="text-[#94a3b8] text-[15px]">Loading CJIA data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ═══════════════════ TOP SECTION ═══════════════════ */}
      <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-3 md:p-5">
        <div className="flex flex-col md:flex-row items-start justify-between gap-4">
          {/* Left: Health Score Gauge */}
          <div className="flex flex-col md:flex-row items-center gap-5 w-full md:flex-1 md:min-w-0">
            {insights?.overall?.health_score != null ? (
              <div className="flex-shrink-0">
                <HealthScoreTooltip score={insights.overall.health_score} breakdown={health?.breakdown} size={100} />
              </div>
            ) : health ? (
              <div className="flex-shrink-0">
                <HealthScoreTooltip score={health.score} severity={health.severity} breakdown={health.breakdown} size={100} />
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
              ) : health ? (
                <div>
                  <p className="text-[20px] font-bold text-[#f1f5f9] leading-snug">
                    CJIA — {health.label}
                  </p>
                  <p className="text-[#94a3b8] text-[15px] mt-1">
                    {data?.mtdPeriod ? `Current period: ${data.mtdPeriod}` : 'Cheddi Jagan International Airport'}
                  </p>
                </div>
              ) : (
                <p className="text-[#94a3b8] text-[15px]">CJIA — Airport Operations Dashboard</p>
              )}
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {/* Upload placeholder */}}
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

        {/* Health Breakdown — full-width below the header row */}
        {health && (
          <HealthBreakdownSection breakdown={health.breakdown} score={health.score} label={health.label} severity={health.severity} />
        )}

        {/* Cross-Cutting Issues */}
        {insights?.cross_cutting && (insights.cross_cutting.issues.length > 0 || insights.cross_cutting.opportunities.length > 0) && (
          <div className="mt-4">
            <CollapsibleSection title="Cross-Cutting Issues" icon={AlertTriangle} defaultOpen={false}>
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

        {/* ────────── TAB 1: OPERATIONS ────────── */}
        {activeTab === 'operations' && (
          <div className="space-y-4">
            <h3 className="text-[#f1f5f9] font-medium text-[22px]">Airport Operations</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KPICard
                title="On-Time Performance"
                value={data ? formatPct(data.onTimePercent) : '--'}
                status={data && data.onTimePercent >= 90 ? 'good' : data && data.onTimePercent >= 80 ? 'warning' : 'critical'}
              />
              <KPICard
                title="Daily Flights"
                value={data ? `${data.dailyFlights}` : '--'}
              />
              <KPICard
                title="Safety Incidents"
                value={data ? `${data.safetyIncidents}` : '--'}
                status={data && data.safetyIncidents === 0 ? 'good' : 'critical'}
                subtitle="This month"
              />
              <KPICard
                title="Int'l Traffic"
                value={data ? formatPct(data.internationalPercent) : '--'}
                subtitle="of total"
              />
            </div>

            {/* Cargo Summary */}
            {data && (data.ytdCargoArrived || data.ytdCargoDeparted) && (
              <CollapsibleSection title="Cargo Summary" icon={Package} defaultOpen={false}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[#64748b] text-xs mb-1">Arrived</p>
                    <p className="text-lg font-bold text-teal-400">
                      {formatNumber(data.ytdCargoArrived)} <span className="text-xs font-normal text-[#64748b]">KG</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[#64748b] text-xs mb-1">Departed</p>
                    <p className="text-lg font-bold text-cyan-400">
                      {formatNumber(data.ytdCargoDeparted)} <span className="text-xs font-normal text-[#64748b]">KG</span>
                    </p>
                  </div>
                </div>
              </CollapsibleSection>
            )}

            {/* AI Insights */}
            {insights?.operations?.cards && insights.operations.cards.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-[#d4af37] font-semibold">AI Operations Insights</p>
                {insights.operations.cards.map((card, i) => (
                  <InsightCard key={i} card={card} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ────────── TAB 2: PASSENGER STATS ────────── */}
        {activeTab === 'passengers' && (
          <div className="space-y-4">
            <h3 className="text-[#f1f5f9] font-medium text-[22px]">Passenger Statistics</h3>

            {metrics ? (
              <>
                {/* Hero Card - Current MTD */}
                <div className="bg-gradient-to-br from-[#1a2744] to-[#1a2744]/80 rounded-2xl p-3 md:p-5 lg:p-6 border border-[#2d3a52]">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-[#d4af37]/10">
                        <Plane className="text-[#d4af37]" size={18} />
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm sm:text-base">January 2026</p>
                        <p className="text-[#64748b] text-xs">{metrics.currentPeriod}</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      metrics.yoyChange >= 0 ? 'bg-emerald-500/[0.15] text-emerald-400' : 'bg-red-500/[0.15] text-red-400'
                    }`}>
                      {metrics.yoyChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {metrics.yoyChange >= 0 ? '+' : ''}{metrics.yoyChange.toFixed(1)}% YoY
                    </div>
                  </div>

                  <div className="mb-5">
                    <p className="text-2xl md:text-4xl lg:text-5xl font-bold text-[#d4af37] tracking-tight">
                      {metrics.currentTotal.toLocaleString()}
                    </p>
                    <p className="text-[#94a3b8] text-sm mt-1">passengers (MTD)</p>
                  </div>

                  {/* Arrivals vs Departures Split */}
                  <div className="space-y-3">
                    <div className="h-2 rounded-full overflow-hidden flex">
                      <div className="bg-teal-500 transition-all" style={{ width: `${arrivalPercent}%` }} />
                      <div className="bg-cyan-500 transition-all" style={{ width: `${100 - arrivalPercent}%` }} />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-2 sm:gap-0 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-teal-500 flex-shrink-0" />
                        <span className="text-[#94a3b8]">Arrivals</span>
                        <span className="text-teal-400 font-semibold">{metrics.currentArrivals.toLocaleString()}</span>
                        <span className="text-[#64748b] text-xs">({arrivalPercent}%)</span>
                      </div>
                      <div className="flex items-center gap-2 sm:flex-row-reverse">
                        <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 flex-shrink-0 sm:order-last" />
                        <span className="text-[#94a3b8]">Departures</span>
                        <span className="text-cyan-400 font-semibold">{metrics.currentDepartures.toLocaleString()}</span>
                        <span className="text-[#64748b] text-xs">({100 - arrivalPercent}%)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2025 Annual Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="bg-[#1a2744] rounded-xl p-3 sm:p-4 border border-[#2d3a52] text-center">
                    <p className="text-[#64748b] text-[10px] sm:text-xs mb-1">2025 Arrivals</p>
                    <p className="text-lg sm:text-xl font-bold text-teal-400">{formatNumber(metrics.annual2025.arrivals)}</p>
                  </div>
                  <div className="bg-[#1a2744] rounded-xl p-3 sm:p-4 border border-[#2d3a52] text-center">
                    <p className="text-[#64748b] text-[10px] sm:text-xs mb-1">2025 Departures</p>
                    <p className="text-lg sm:text-xl font-bold text-cyan-400">{formatNumber(metrics.annual2025.departures)}</p>
                  </div>
                  <div className="bg-[#d4af37]/[0.08] rounded-xl p-3 sm:p-4 border border-[#d4af37]/30 text-center">
                    <p className="text-[#d4af37]/70 text-[10px] sm:text-xs mb-1">2025 Total</p>
                    <p className="text-lg sm:text-xl font-bold text-[#d4af37]">{formatNumber(metrics.annual2025.total)}</p>
                  </div>
                </div>

                {/* Monthly Breakdown - Sorted */}
                <CollapsibleSection title="2025 Monthly Breakdown" icon={Calendar} defaultOpen={false}>
                  <div className="space-y-2">
                    {metrics.sortedMonths.map((month) => {
                      const isPeak = month.month === metrics.peakMonth.month;
                      const barWidth = metrics.maxTotal > 0 ? (month.total / metrics.maxTotal) * 100 : 0;
                      return (
                        <div key={month.month} className="group">
                          <div className="flex items-center gap-3">
                            <div className="w-10 sm:w-12 flex-shrink-0">
                              <span className={`text-xs sm:text-sm font-medium ${isPeak ? 'text-[#d4af37]' : 'text-[#94a3b8]'}`}>
                                {month.month}
                              </span>
                            </div>
                            <div className="flex-1 h-6 sm:h-7 bg-[#0a1628] rounded-lg overflow-hidden relative">
                              <div
                                className={`h-full rounded-lg transition-all ${
                                  isPeak ? 'bg-gradient-to-r from-[#d4af37] to-[#e5c04a]' : 'bg-gradient-to-r from-teal-600 to-cyan-600'
                                }`}
                                style={{ width: `${barWidth}%` }}
                              />
                              <div className="absolute inset-0 flex items-center px-3">
                                <span className={`text-xs sm:text-sm font-semibold ${barWidth > 30 ? 'text-white' : 'text-[#94a3b8]'}`}>
                                  {formatNumber(month.total)}
                                </span>
                              </div>
                            </div>
                            <div className="w-5 flex-shrink-0">
                              {isPeak && <Star className="text-[#d4af37] fill-[#d4af37]" size={14} />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 pt-4 border-t border-[#2d3a52] flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-[#94a3b8]">
                      <Star className="text-[#d4af37] fill-[#d4af37]" size={12} />
                      <span>Peak: <span className="text-[#d4af37] font-semibold">{metrics.peakMonth.month} 2025</span></span>
                    </div>
                    <span className="text-[#d4af37] font-bold text-sm sm:text-base">
                      {metrics.peakMonth.total?.toLocaleString()} passengers
                    </span>
                  </div>
                </CollapsibleSection>

                {/* YoY Comparison */}
                {data?.historicalComparison && (
                  <CollapsibleSection title="Year-over-Year Comparison (Jan 1-26)" icon={TrendingUp} defaultOpen={false}>
                    <div className="space-y-2">
                      {data.historicalComparison.slice().reverse().map((year) => {
                        const maxYearTotal = Math.max(...data.historicalComparison.map((y) => y.total), 1);
                        const barWidth = maxYearTotal > 0 ? (year.total / maxYearTotal) * 100 : 0;
                        const isCurrentYear = year.year === '2026';
                        return (
                          <div key={year.year} className="flex items-center gap-3">
                            <div className="w-12 flex-shrink-0">
                              <span className={`text-xs sm:text-sm font-medium ${isCurrentYear ? 'text-[#d4af37]' : 'text-[#94a3b8]'}`}>
                                {year.year}
                              </span>
                            </div>
                            <div className="flex-1 h-5 sm:h-6 bg-[#0a1628] rounded overflow-hidden relative">
                              <div
                                className={`h-full rounded ${isCurrentYear ? 'bg-[#d4af37]' : 'bg-teal-600/70'}`}
                                style={{ width: `${barWidth}%` }}
                              />
                              <div className="absolute inset-0 flex items-center px-2">
                                <span className={`text-xs font-medium ${barWidth > 25 ? 'text-white' : 'text-[#94a3b8]'}`}>
                                  {formatNumber(year.total)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[#64748b] text-xs mt-3">Same period comparison (January 1-26 each year)</p>
                  </CollapsibleSection>
                )}
              </>
            ) : (
              <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-6 md:p-12 text-center">
                <p className="text-[#64748b] text-base">No passenger data available. Upload CJIA reports to populate.</p>
              </div>
            )}

            {/* AI Insights */}
            {insights?.passengers?.cards && insights.passengers.cards.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-[#d4af37] font-semibold">AI Passenger Insights</p>
                {insights.passengers.cards.map((card, i) => (
                  <InsightCard key={i} card={card} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ────────── TAB 3: REVENUE ────────── */}
        {activeTab === 'revenue' && (
          <div className="space-y-4">
            <h3 className="text-[#f1f5f9] font-medium text-[22px]">Revenue & Financial</h3>

            <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-6 md:p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#2d3a52] flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-[#64748b]" />
              </div>
              <h4 className="text-[#f1f5f9] text-lg font-semibold mb-2">Revenue Data Coming Soon</h4>
              <p className="text-[#64748b] text-base max-w-md mx-auto">
                Upload CJIA financial reports to see revenue vs. target analysis, aeronautical vs. non-aeronautical revenue breakdown, and cost tracking.
              </p>
            </div>

            {/* AI Insights */}
            {insights?.revenue?.cards && insights.revenue.cards.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-[#d4af37] font-semibold">AI Revenue Insights</p>
                {insights.revenue.cards.map((card, i) => (
                  <InsightCard key={i} card={card} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ────────── TAB 4: PROJECTS ────────── */}
        {activeTab === 'projects' && (
          <div className="space-y-4">
            <h3 className="text-[#f1f5f9] font-medium text-[22px]">Infrastructure Projects</h3>

            <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] p-6 md:p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#2d3a52] flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-[#64748b]" />
              </div>
              <h4 className="text-[#f1f5f9] text-lg font-semibold mb-2">Project Data Coming Soon</h4>
              <p className="text-[#64748b] text-base max-w-md mx-auto">
                Upload CJIA project status reports to track terminal expansion, runway upgrades, and other infrastructure initiatives.
              </p>
            </div>

            {/* AI Insights */}
            {insights?.projects?.cards && insights.projects.cards.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-[#d4af37] font-semibold">AI Project Insights</p>
                {insights.projects.cards.map((card, i) => (
                  <InsightCard key={i} card={card} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Data source footer */}
      <p className="text-[#64748b] text-[10px] sm:text-xs text-center">
        Source: CJIA Passenger Movement Reports | January 2026 data: Jan 1-26 (partial month)
      </p>
    </div>
  );
}
