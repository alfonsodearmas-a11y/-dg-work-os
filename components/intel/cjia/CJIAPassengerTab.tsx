'use client';

import { useMemo } from 'react';
import {
  Plane, TrendingUp, TrendingDown, Star, Calendar,
} from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { InsightCard, type InsightCardData } from '@/components/ui/InsightCard';
import type { CJIAData } from '@/data/mockData';

// ── Types ───────────────────────────────────────────────────────────────────

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

interface CJIAPassengerTabProps {
  data?: CJIAData;
  passengerInsights?: InsightCardData[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toLocaleString();
}

// ── Component ───────────────────────────────────────────────────────────────

export function CJIAPassengerTab({ data, passengerInsights }: CJIAPassengerTabProps) {
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

    return {
      currentPeriod, currentTotal, currentArrivals, currentDepartures, yoyChange,
      annual2025, monthlyWithTotals, sortedMonths, peakMonth,
      maxTotal: peakMonth?.total || 1,
    };
  }, [data, monthlyData2025]);

  // Arrival/departure ratio for current month
  const arrivalPercent = metrics && metrics.currentTotal > 0
    ? Math.round((metrics.currentArrivals / metrics.currentTotal) * 100)
    : 50;

  return (
    <div className="space-y-4">
      <h3 className="text-slate-100 font-medium text-[22px]">Passenger Statistics</h3>

      {metrics ? (
        <>
          {/* Hero Card - Current MTD */}
          <div className="bg-gradient-to-br from-[#1a2744] to-[#1a2744]/80 rounded-2xl p-3 md:p-5 lg:p-6 border border-navy-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gold-500/10">
                  <Plane className="text-gold-500" size={18} />
                </div>
                <div>
                  <p className="text-white font-medium text-sm sm:text-base">January 2026</p>
                  <p className="text-navy-600 text-xs">{metrics.currentPeriod}</p>
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
              <p className="text-2xl md:text-4xl lg:text-5xl font-bold text-gold-500 tracking-tight">
                {metrics.currentTotal.toLocaleString()}
              </p>
              <p className="text-slate-400 text-sm mt-1">passengers (MTD)</p>
            </div>

            {/* Arrivals vs Departures Split */}
            <div className="space-y-3">
              <div className="h-2 rounded-full overflow-hidden flex" role="progressbar" aria-valuenow={arrivalPercent} aria-valuemin={0} aria-valuemax={100} aria-label={`Arrivals ${arrivalPercent}%, Departures ${100 - arrivalPercent}%`}>
                <div className="bg-teal-500 transition-all" style={{ width: `${arrivalPercent}%` }} />
                <div className="bg-cyan-500 transition-all" style={{ width: `${100 - arrivalPercent}%` }} />
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-2 sm:gap-0 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-teal-500 flex-shrink-0" aria-hidden="true" />
                  <span className="text-slate-400">Arrivals</span>
                  <span className="text-teal-400 font-semibold">{metrics.currentArrivals.toLocaleString()}</span>
                  <span className="text-navy-600 text-xs">({arrivalPercent}%)</span>
                </div>
                <div className="flex items-center gap-2 sm:flex-row-reverse">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 flex-shrink-0 sm:order-last" aria-hidden="true" />
                  <span className="text-slate-400">Departures</span>
                  <span className="text-cyan-400 font-semibold">{metrics.currentDepartures.toLocaleString()}</span>
                  <span className="text-navy-600 text-xs">({100 - arrivalPercent}%)</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2025 Annual Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-navy-900 rounded-xl p-3 sm:p-4 border border-navy-800 text-center">
              <p className="text-navy-600 text-[10px] sm:text-xs mb-1">2025 Arrivals</p>
              <p className="text-lg sm:text-xl font-bold text-teal-400">{formatNumber(metrics.annual2025.arrivals)}</p>
            </div>
            <div className="bg-navy-900 rounded-xl p-3 sm:p-4 border border-navy-800 text-center">
              <p className="text-navy-600 text-[10px] sm:text-xs mb-1">2025 Departures</p>
              <p className="text-lg sm:text-xl font-bold text-cyan-400">{formatNumber(metrics.annual2025.departures)}</p>
            </div>
            <div className="bg-gold-500/[0.08] rounded-xl p-3 sm:p-4 border border-gold-500/30 text-center">
              <p className="text-gold-500/70 text-[10px] sm:text-xs mb-1">2025 Total</p>
              <p className="text-lg sm:text-xl font-bold text-gold-500">{formatNumber(metrics.annual2025.total)}</p>
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
                        <span className={`text-xs sm:text-sm font-medium ${isPeak ? 'text-gold-500' : 'text-slate-400'}`}>
                          {month.month}
                        </span>
                      </div>
                      <div className="flex-1 h-6 sm:h-7 bg-navy-950 rounded-lg overflow-hidden relative">
                        <div
                          className={`h-full rounded-lg transition-all ${
                            isPeak ? 'bg-gradient-to-r from-[#d4af37] to-[#e5c04a]' : 'bg-gradient-to-r from-teal-600 to-cyan-600'
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                        <div className="absolute inset-0 flex items-center px-3">
                          <span className={`text-xs sm:text-sm font-semibold ${barWidth > 30 ? 'text-white' : 'text-slate-400'}`}>
                            {formatNumber(month.total)}
                          </span>
                        </div>
                      </div>
                      <div className="w-5 flex-shrink-0">
                        {isPeak && <Star className="text-gold-500 fill-[#d4af37]" size={14} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-navy-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400">
                <Star className="text-gold-500 fill-[#d4af37]" size={12} />
                <span>Peak: <span className="text-gold-500 font-semibold">{metrics.peakMonth.month} 2025</span></span>
              </div>
              <span className="text-gold-500 font-bold text-sm sm:text-base">
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
                        <span className={`text-xs sm:text-sm font-medium ${isCurrentYear ? 'text-gold-500' : 'text-slate-400'}`}>
                          {year.year}
                        </span>
                      </div>
                      <div className="flex-1 h-5 sm:h-6 bg-navy-950 rounded overflow-hidden relative">
                        <div
                          className={`h-full rounded ${isCurrentYear ? 'bg-gold-500' : 'bg-teal-600/70'}`}
                          style={{ width: `${barWidth}%` }}
                        />
                        <div className="absolute inset-0 flex items-center px-2">
                          <span className={`text-xs font-medium ${barWidth > 25 ? 'text-white' : 'text-slate-400'}`}>
                            {formatNumber(year.total)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-navy-600 text-xs mt-3">Same period comparison (January 1-26 each year)</p>
            </CollapsibleSection>
          )}
        </>
      ) : (
        <div className="bg-navy-900 rounded-xl border border-navy-800 p-6 md:p-12 text-center">
          <p className="text-navy-600 text-base">No passenger data available. Upload CJIA reports to populate.</p>
        </div>
      )}

      {/* AI Insights */}
      {passengerInsights && passengerInsights.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-gold-500 font-semibold">AI Passenger Insights</p>
          {passengerInsights.map((card, i) => (
            <InsightCard key={i} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}
