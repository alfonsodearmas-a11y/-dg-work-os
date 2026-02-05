'use client';

import { useMemo } from 'react';
import { Plane, TrendingUp, TrendingDown, Package, Star, Calendar } from 'lucide-react';
import type { CJIAData } from '@/data/mockData';

interface CJIADetailProps {
  data: CJIAData;
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

interface LastFullMonth {
  month: string;
  total: number;
  arrivals: number;
  departures: number;
}

interface DerivedMetrics {
  currentPeriod: string;
  currentTotal: number;
  currentArrivals: number;
  currentDepartures: number;
  yoyChange: number;
  isPartialMonth: boolean;
  annual2025: {
    arrivals: number;
    departures: number;
    total: number;
  };
  monthlyWithTotals: MonthlyWithTotals[];
  sortedMonths: MonthlyWithTotals[];
  peakMonth: MonthlyWithTotals;
  maxTotal: number;
  lastFullMonth: LastFullMonth | null;
}

export function CJIADetail({ data }: CJIADetailProps) {
  if (!data) return null;

  // Get historical data
  const historicalData = data.historicalMonthlyData || {};
  const monthlyData2025: MonthlyEntry[] = historicalData['2025'] || [];

  // Calculate derived metrics
  const metrics: DerivedMetrics = useMemo(() => {
    // Current month is January 2026 MTD (from the uploaded data)
    const currentTotal = data.mtdTotal || 0;
    const currentArrivals = data.mtdArrivals || 0;
    const currentDepartures = data.mtdDepartures || 0;
    const currentPeriod = data.mtdPeriod || 'January 2026';

    // Compare to January 2025 for YoY
    const jan2025 = monthlyData2025.find((m) => m.month === 'Jan');
    const jan2025Total = jan2025 ? jan2025.arrivals + jan2025.departures : 0;

    // For MoM, compare to December 2025
    const dec2025 = monthlyData2025.find((m) => m.month === 'Dec');
    const dec2025Total = dec2025 ? dec2025.arrivals + dec2025.departures : 0;

    // YoY change (vs Jan 2025 same period - approximate since we have full month vs partial)
    const yoyChange = data.mtdYoyChange || 0;

    // Annual totals for 2025
    const annual2025 = {
      arrivals:
        data.annual2025Arrivals ||
        monthlyData2025.reduce((sum, m) => sum + m.arrivals, 0),
      departures:
        data.annual2025Departures ||
        monthlyData2025.reduce((sum, m) => sum + m.departures, 0),
      total:
        data.annual2025Total ||
        monthlyData2025.reduce((sum, m) => sum + m.arrivals + m.departures, 0),
    };

    // Monthly data with totals
    const monthlyWithTotals: MonthlyWithTotals[] = monthlyData2025.map((m) => ({
      ...m,
      monthFull: `${m.month} 2025`,
      total: m.arrivals + m.departures,
    }));

    // Find peak month in 2025
    const defaultMonth: MonthlyWithTotals = {
      month: '',
      arrivals: 0,
      departures: 0,
      monthFull: '',
      total: 0,
    };
    const peakMonth = monthlyWithTotals.reduce(
      (max, m) => (m.total > max.total ? m : max),
      monthlyWithTotals[0] || defaultMonth
    );

    // Sort by total for the ranked display
    const sortedMonths = [...monthlyWithTotals].sort((a, b) => b.total - a.total);

    return {
      // Current month (January 2026)
      currentPeriod,
      currentTotal,
      currentArrivals,
      currentDepartures,
      yoyChange,
      isPartialMonth: true,

      // 2025 annual data
      annual2025,

      // 2025 monthly breakdown
      monthlyWithTotals,
      sortedMonths,
      peakMonth,
      maxTotal: peakMonth?.total || 1,

      // December 2025 for comparison display
      lastFullMonth: dec2025
        ? {
            month: 'December 2025',
            total: dec2025Total,
            arrivals: dec2025.arrivals,
            departures: dec2025.departures,
          }
        : null,
    };
  }, [data, monthlyData2025]);

  // Format large numbers
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toLocaleString();
  };

  // Arrival/departure ratio for current month
  const arrivalPercent =
    metrics.currentTotal > 0
      ? Math.round((metrics.currentArrivals / metrics.currentTotal) * 100)
      : 50;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Hero Card - January 2026 MTD */}
      <div className="bg-gradient-to-br from-[#1a2744] to-[#1a2744]/80 rounded-2xl p-5 sm:p-6 border border-[#2d3a52]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[#d4af37]/10">
              <Plane className="text-[#d4af37]" size={18} />
            </div>
            <div>
              <p className="text-white font-medium text-sm sm:text-base">
                January 2026
              </p>
              <p className="text-[#64748b] text-xs">{metrics.currentPeriod}</p>
            </div>
          </div>
          {/* YoY Trend Badge */}
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
              metrics.yoyChange >= 0
                ? 'bg-emerald-500/[0.15] text-emerald-400'
                : 'bg-red-500/[0.15] text-red-400'
            }`}
          >
            {metrics.yoyChange >= 0 ? (
              <TrendingUp size={12} />
            ) : (
              <TrendingDown size={12} />
            )}
            {metrics.yoyChange >= 0 ? '+' : ''}
            {metrics.yoyChange.toFixed(1)}% YoY
          </div>
        </div>

        {/* Hero Number */}
        <div className="mb-5">
          <p className="text-4xl sm:text-5xl font-bold text-[#d4af37] tracking-tight">
            {metrics.currentTotal.toLocaleString()}
          </p>
          <p className="text-[#94a3b8] text-sm mt-1">passengers (MTD)</p>
        </div>

        {/* Arrivals vs Departures Split */}
        <div className="space-y-3">
          {/* Visual Bar */}
          <div className="h-2 rounded-full overflow-hidden flex">
            <div
              className="bg-teal-500 transition-all"
              style={{ width: `${arrivalPercent}%` }}
            />
            <div
              className="bg-cyan-500 transition-all"
              style={{ width: `${100 - arrivalPercent}%` }}
            />
          </div>

          {/* Labels - Mobile optimized */}
          <div className="flex flex-col sm:flex-row sm:justify-between gap-2 sm:gap-0 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-teal-500 flex-shrink-0" />
              <span className="text-[#94a3b8]">Arrivals</span>
              <span className="text-teal-400 font-semibold">
                {metrics.currentArrivals.toLocaleString()}
              </span>
              <span className="text-[#64748b] text-xs">({arrivalPercent}%)</span>
            </div>
            <div className="flex items-center gap-2 sm:flex-row-reverse">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 flex-shrink-0 sm:order-last" />
              <span className="text-[#94a3b8]">Departures</span>
              <span className="text-cyan-400 font-semibold">
                {metrics.currentDepartures.toLocaleString()}
              </span>
              <span className="text-[#64748b] text-xs">
                ({100 - arrivalPercent}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Last Full Month Comparison */}
      {metrics.lastFullMonth && (
        <div className="bg-[#1a2744]/50 rounded-xl p-4 border border-[#2d3a52]/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[#64748b] text-xs">Last Full Month</p>
              <p className="text-[#94a3b8] text-sm font-medium">
                {metrics.lastFullMonth.month}
              </p>
            </div>
            <div className="text-right">
              <p className="text-white font-bold text-lg">
                {metrics.lastFullMonth.total.toLocaleString()}
              </p>
              <p className="text-[#64748b] text-xs">
                {metrics.lastFullMonth.arrivals.toLocaleString()} arr /{' '}
                {metrics.lastFullMonth.departures.toLocaleString()} dep
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2025 Annual Summary */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-[#1a2744] rounded-xl p-3 sm:p-4 border border-[#2d3a52] text-center">
          <p className="text-[#64748b] text-[10px] sm:text-xs mb-1">
            2025 Arrivals
          </p>
          <p className="text-lg sm:text-xl font-bold text-teal-400">
            {formatNumber(metrics.annual2025.arrivals)}
          </p>
        </div>
        <div className="bg-[#1a2744] rounded-xl p-3 sm:p-4 border border-[#2d3a52] text-center">
          <p className="text-[#64748b] text-[10px] sm:text-xs mb-1">
            2025 Departures
          </p>
          <p className="text-lg sm:text-xl font-bold text-cyan-400">
            {formatNumber(metrics.annual2025.departures)}
          </p>
        </div>
        <div className="bg-[#d4af37]/[0.08] rounded-xl p-3 sm:p-4 border border-[#d4af37]/30 text-center">
          <p className="text-[#d4af37]/70 text-[10px] sm:text-xs mb-1">
            2025 Total
          </p>
          <p className="text-lg sm:text-xl font-bold text-[#d4af37]">
            {formatNumber(metrics.annual2025.total)}
          </p>
        </div>
      </div>

      {/* 2025 Monthly Trend - Horizontal Bars (Sorted) */}
      <div className="bg-[#1a2744] rounded-xl p-4 sm:p-5 border border-[#2d3a52]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="text-[#94a3b8]" size={16} />
            <h4 className="text-white font-medium text-sm sm:text-base">
              2025 Monthly Breakdown
            </h4>
          </div>
          <span className="text-[#64748b] text-xs">Sorted by volume</span>
        </div>

        <div className="space-y-2">
          {metrics.sortedMonths.map((month) => {
            const isPeak = month.month === metrics.peakMonth.month;
            const barWidth = (month.total / metrics.maxTotal) * 100;

            return (
              <div key={month.month} className="group">
                <div className="flex items-center gap-3">
                  {/* Month Label */}
                  <div className="w-10 sm:w-12 flex-shrink-0">
                    <span
                      className={`text-xs sm:text-sm font-medium ${
                        isPeak ? 'text-[#d4af37]' : 'text-[#94a3b8]'
                      }`}
                    >
                      {month.month}
                    </span>
                  </div>

                  {/* Bar */}
                  <div className="flex-1 h-6 sm:h-7 bg-[#0a1628] rounded-lg overflow-hidden relative">
                    <div
                      className={`h-full rounded-lg transition-all ${
                        isPeak
                          ? 'bg-gradient-to-r from-[#d4af37] to-[#e5c04a]'
                          : 'bg-gradient-to-r from-teal-600 to-cyan-600'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                    {/* Value overlay */}
                    <div className="absolute inset-0 flex items-center px-3">
                      <span
                        className={`text-xs sm:text-sm font-semibold ${
                          barWidth > 30 ? 'text-white' : 'text-[#94a3b8]'
                        }`}
                      >
                        {formatNumber(month.total)}
                      </span>
                    </div>
                  </div>

                  {/* Peak indicator */}
                  <div className="w-5 flex-shrink-0">
                    {isPeak && (
                      <Star
                        className="text-[#d4af37] fill-[#d4af37]"
                        size={14}
                      />
                    )}
                  </div>
                </div>

                {/* Expanded details on hover (desktop) */}
                <div className="hidden sm:group-hover:flex ml-[52px] sm:ml-[60px] mr-8 mt-1 text-[10px] text-[#64748b] gap-4">
                  <span>
                    Arrivals:{' '}
                    <span className="text-teal-400">
                      {month.arrivals.toLocaleString()}
                    </span>
                  </span>
                  <span>
                    Departures:{' '}
                    <span className="text-cyan-400">
                      {month.departures.toLocaleString()}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Peak callout */}
        <div className="mt-4 pt-4 border-t border-[#2d3a52] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-[#94a3b8]">
            <Star className="text-[#d4af37] fill-[#d4af37]" size={12} />
            <span>
              Peak:{' '}
              <span className="text-[#d4af37] font-semibold">
                {metrics.peakMonth.month} 2025
              </span>
            </span>
          </div>
          <span className="text-[#d4af37] font-bold text-sm sm:text-base">
            {metrics.peakMonth.total?.toLocaleString()} passengers
          </span>
        </div>
      </div>

      {/* Chronological View (Expandable) */}
      <details className="bg-[#1a2744] rounded-xl border border-[#2d3a52] group">
        <summary className="p-4 sm:p-5 cursor-pointer text-white font-medium hover:bg-[#2d3a52]/30 rounded-xl transition-colors list-none flex items-center justify-between text-sm sm:text-base">
          <span>View Chronological Order</span>
          <span className="text-[#64748b] text-xs group-open:hidden">
            Tap to expand
          </span>
        </summary>
        <div className="px-4 sm:px-5 pb-4 sm:pb-5">
          <div className="space-y-1.5">
            {metrics.monthlyWithTotals.map((month) => {
              const isPeak = month.month === metrics.peakMonth.month;
              const barWidth = (month.total / metrics.maxTotal) * 100;

              return (
                <div key={month.month} className="flex items-center gap-3">
                  <div className="w-10 sm:w-12 flex-shrink-0">
                    <span
                      className={`text-xs sm:text-sm ${
                        isPeak
                          ? 'text-[#d4af37] font-semibold'
                          : 'text-[#64748b]'
                      }`}
                    >
                      {month.month}
                    </span>
                  </div>
                  <div className="flex-1 h-4 sm:h-5 bg-[#0a1628] rounded overflow-hidden">
                    <div
                      className={`h-full rounded ${
                        isPeak ? 'bg-[#d4af37]' : 'bg-teal-600/70'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <div className="w-16 sm:w-20 text-right">
                    <span
                      className={`text-xs sm:text-sm ${
                        isPeak
                          ? 'text-[#d4af37] font-semibold'
                          : 'text-[#94a3b8]'
                      }`}
                    >
                      {formatNumber(month.total)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </details>

      {/* YoY Comparison (Expandable) */}
      {data.historicalComparison && (
        <details className="bg-[#1a2744] rounded-xl border border-[#2d3a52] group">
          <summary className="p-4 sm:p-5 cursor-pointer text-white font-medium hover:bg-[#2d3a52]/30 rounded-xl transition-colors list-none flex items-center justify-between text-sm sm:text-base">
            <span>Year-over-Year Comparison (Jan 1-26)</span>
            <span className="text-[#64748b] text-xs group-open:hidden">
              Tap to expand
            </span>
          </summary>
          <div className="px-4 sm:px-5 pb-4 sm:pb-5">
            <div className="space-y-2">
              {data.historicalComparison
                .slice()
                .reverse()
                .map((year) => {
                  const maxYearTotal = Math.max(
                    ...data.historicalComparison.map((y) => y.total)
                  );
                  const barWidth = (year.total / maxYearTotal) * 100;
                  const isCurrentYear = year.year === '2026';

                  return (
                    <div key={year.year} className="flex items-center gap-3">
                      <div className="w-12 flex-shrink-0">
                        <span
                          className={`text-xs sm:text-sm font-medium ${
                            isCurrentYear ? 'text-[#d4af37]' : 'text-[#94a3b8]'
                          }`}
                        >
                          {year.year}
                        </span>
                      </div>
                      <div className="flex-1 h-5 sm:h-6 bg-[#0a1628] rounded overflow-hidden relative">
                        <div
                          className={`h-full rounded ${
                            isCurrentYear ? 'bg-[#d4af37]' : 'bg-teal-600/70'
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                        <div className="absolute inset-0 flex items-center px-2">
                          <span
                            className={`text-xs font-medium ${
                              barWidth > 25 ? 'text-white' : 'text-[#94a3b8]'
                            }`}
                          >
                            {formatNumber(year.total)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            <p className="text-[#64748b] text-xs mt-3">
              Same period comparison (January 1-26 each year)
            </p>
          </div>
        </details>
      )}

      {/* Cargo Section (Simplified) */}
      {(data.ytdCargoArrived || data.ytdCargoDeparted) && (
        <div className="bg-[#1a2744] rounded-xl p-4 sm:p-5 border border-[#2d3a52]">
          <div className="flex items-center gap-2 mb-4">
            <Package className="text-[#94a3b8]" size={16} />
            <h4 className="text-white font-medium text-sm sm:text-base">
              2025 Cargo Summary
            </h4>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[#64748b] text-xs mb-1">Arrived</p>
              <p className="text-lg sm:text-xl font-bold text-teal-400">
                {formatNumber(data.ytdCargoArrived)}{' '}
                <span className="text-xs font-normal text-[#64748b]">KG</span>
              </p>
            </div>
            <div>
              <p className="text-[#64748b] text-xs mb-1">Departed</p>
              <p className="text-lg sm:text-xl font-bold text-cyan-400">
                {formatNumber(data.ytdCargoDeparted)}{' '}
                <span className="text-xs font-normal text-[#64748b]">KG</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Data source footer */}
      <p className="text-[#64748b] text-[10px] sm:text-xs text-center">
        Source: CJIA Passenger Movement Reports | January 2026 data: Jan 1-26
        (partial month)
      </p>
    </div>
  );
}
