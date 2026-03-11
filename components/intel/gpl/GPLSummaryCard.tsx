'use client';

import {
  Calendar, RefreshCw,
} from 'lucide-react';
import type { GPLData } from '@/data/mockData';
import { HealthScoreTooltip } from '@/components/ui/HealthScoreTooltip';
import { HealthBreakdownSection } from '@/components/ui/HealthBreakdownSection';
import type { GPLSummary, GPLHealthResult } from './gpl-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GPLSummaryCardProps {
  data: GPLData;
  summary: GPLSummary;
  gplHealth: GPLHealthResult | null;
  healthStatus: 'critical' | 'warning' | 'good';
  reserveMargin: number;
  eveningPeak: number;
  historyDates: { reportDate: string; fileName: string; createdAt: string }[];
  selectedDate: string;
  historyLoading: boolean;
  onDateChange: (date: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GPLSummaryCard({
  data,
  summary,
  gplHealth,
  healthStatus,
  reserveMargin,
  eveningPeak,
  historyDates,
  selectedDate,
  historyLoading,
  onDateChange,
}: GPLSummaryCardProps) {
  return (
    <div className="bg-navy-900 rounded-xl border border-navy-800 p-3 md:p-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-3 gap-4">
        <div className="flex items-start gap-4 w-full md:flex-1 md:min-w-0">
          {/* Health Score Gauge with Tooltip */}
          {gplHealth && (
            <div className="flex flex-col items-center flex-shrink-0">
              <HealthScoreTooltip
                score={gplHealth.score}
                severity={gplHealth.severity}
                breakdown={gplHealth.breakdown}
                size={88}
              />
              <span className={`text-[10px] font-medium mt-1 ${
                gplHealth.severity === 'critical' ? 'text-red-400'
                  : gplHealth.severity === 'warning' ? 'text-amber-400'
                  : gplHealth.severity === 'positive' ? 'text-emerald-400'
                  : 'text-blue-400'
              }`}>
                {gplHealth.label}
              </span>
            </div>
          )}
          {/* AI Headline */}
          <div className="min-w-0 flex-1 pt-1">
            {data.aiAnalysis?.executiveBriefing ? (
              <>
                <p className="text-gold-500 text-sm font-semibold mb-1">AI Executive Briefing</p>
                <p className="text-slate-400 text-[13px] leading-relaxed line-clamp-3">
                  {typeof data.aiAnalysis.executiveBriefing === 'string'
                    ? data.aiAnalysis.executiveBriefing
                    : data.aiAnalysis.executiveBriefing.executive_summary || data.aiAnalysis.executiveBriefing.headline || 'Analysis available'}
                </p>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${
                  healthStatus === 'critical' ? 'bg-red-500 animate-pulse' :
                  healthStatus === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                }`} />
                <span className="text-slate-400 text-[15px] font-medium">System Health</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {historyDates.length > 1 && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-navy-600" />
              <select
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                disabled={historyLoading}
                aria-label="Select report date"
                className="bg-navy-950 text-slate-400 text-sm border border-navy-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-gold-500 disabled:opacity-50"
              >
                {historyDates.map(h => (
                  <option key={h.reportDate} value={h.reportDate}>
                    {new Date(h.reportDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </option>
                ))}
              </select>
              {historyLoading && (
                <RefreshCw className="w-4 h-4 text-gold-500 animate-spin" />
              )}
            </div>
          )}
          {historyDates.length <= 1 && (
            <span className="text-sm text-navy-600">Updated: {data.capacityDate || '-'}</span>
          )}
        </div>
      </div>

      {/* Health Breakdown -- full-width below the header row */}
      {gplHealth && (
        <HealthBreakdownSection
          breakdown={gplHealth.breakdown}
          score={gplHealth.score}
          label={gplHealth.label}
          severity={gplHealth.severity}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Available Capacity */}
        <div className="flex items-center gap-3 p-2.5 md:p-4 bg-navy-950 rounded-lg border-l-4 border-emerald-500">
          <div>
            <p className="text-navy-600 text-[15px]">Available Capacity</p>
            <p className="text-xl md:text-2xl font-bold text-slate-100">{summary.totalAvailable}<span className="text-sm md:text-base font-normal text-navy-600"> / {summary.totalDerated} MW</span></p>
          </div>
        </div>

        {/* Reserve Margin */}
        <div className={`flex items-center gap-3 p-2.5 md:p-4 bg-navy-950 rounded-lg border-l-4 ${
          reserveMargin < 10 ? 'border-red-500' : reserveMargin < 15 ? 'border-amber-500' : 'border-emerald-500'
        }`}>
          <div>
            <p className="text-navy-600 text-[15px]">Reserve Margin</p>
            <p className={`text-xl md:text-2xl font-bold ${
              reserveMargin < 10 ? 'text-red-400' : reserveMargin < 15 ? 'text-amber-400' : 'text-emerald-400'
            }`}>{reserveMargin.toFixed(1)}%</p>
            <p className="text-navy-600 text-xs">{reserveMargin < 15 ? 'Below 15% safe threshold' : 'Adequate'}</p>
          </div>
        </div>

        {/* Offline Capacity */}
        <div className={`flex items-center gap-3 p-2.5 md:p-4 bg-navy-950 rounded-lg border-l-4 ${
          summary.offline.length > 0 ? 'border-red-500' : 'border-navy-800'
        }`}>
          <div>
            <p className="text-navy-600 text-[15px]">Offline Capacity</p>
            <p className="text-xl md:text-2xl font-bold text-red-400">{summary.totalOffline} MW</p>
            <p className="text-navy-600 text-xs">{summary.offline.length} stations offline</p>
          </div>
        </div>

        {/* Peak Demand */}
        <div className="flex items-center gap-3 p-2.5 md:p-4 bg-navy-950 rounded-lg border-l-4 border-purple-500">
          <div>
            <p className="text-navy-600 text-[15px]">Peak Demand (Evening)</p>
            <p className="text-xl md:text-2xl font-bold text-purple-400">{eveningPeak || '-'} MW</p>
            <p className="text-navy-600 text-xs">{data.peakDemandDate || '-'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
