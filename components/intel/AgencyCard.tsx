'use client';

import { ChevronRight, AlertTriangle } from 'lucide-react';
import { StatusBadge, Sparkline, TrendIndicator } from './common';
import { HealthScoreGauge } from '@/components/ui/HealthScoreGauge';
import type { LucideIcon } from 'lucide-react';

interface Metric {
  label: string;
  value: string | number;
  highlight?: boolean;
  status?: 'good' | 'warning' | 'critical';
}

export interface GridMetric {
  label: string;
  value: string;
  badge?: string;
  badgeColor?: 'green' | 'amber' | 'red' | 'blue';
}

interface WarningBadge {
  count: number;
  text: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface AgencyData {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  accentColor: string;
  status?: { type: 'good' | 'warning' | 'critical'; text: string };
  metrics?: Metric[];
  gridMetrics?: GridMetric[];
  healthScore?: number;
  healthLabel?: string;
  healthSeverity?: 'critical' | 'warning' | 'stable' | 'positive';
  sparklineData?: number[];
  trend?: number | null;
  warningBadge?: WarningBadge | null;
  data?: any;
}

interface AgencyCardProps {
  agency: AgencyData;
  onClick: () => void;
  compact?: boolean;
}

export function AgencyCard({ agency, onClick, compact = false }: AgencyCardProps) {
  const { title, subtitle, icon: Icon, accentColor, status, metrics, sparklineData, trend, warningBadge } = agency;

  return (
    <div
      onClick={onClick}
      className={`bg-[#1a2744] backdrop-blur-sm border rounded-2xl ${compact ? 'p-4' : 'p-5'} cursor-pointer transition-all duration-200 group hover:shadow-xl ${
        status?.type === 'critical'
          ? 'border-red-500/40 hover:border-red-400/60 hover:shadow-red-500/10'
          : status?.type === 'warning'
          ? 'border-amber-500/40 hover:border-amber-400/60 hover:shadow-amber-500/10'
          : 'border-[#2d3a52] hover:border-[#d4af37]/50 hover:shadow-[#d4af37]/10'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className={`p-2 sm:p-2.5 rounded-xl bg-gradient-to-br ${accentColor} shadow-lg flex-shrink-0`}>
            <Icon className="text-white" size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-white text-base sm:text-lg leading-tight truncate">{title}</h3>
            <p className="text-[#64748b] text-xs mt-0.5 truncate">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <StatusBadge status={status?.type} text={status?.text} />
          <ChevronRight
            className="text-[#64748b] group-hover:text-[#d4af37] group-hover:translate-x-0.5 transition-all hidden sm:block"
            size={18}
          />
        </div>
      </div>

      {/* Warning Badge */}
      {!compact && warningBadge && (
        <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-lg border ${
          warningBadge.severity === 'critical'
            ? 'bg-orange-500/15 border-orange-500/40'
            : warningBadge.severity === 'warning'
            ? 'bg-amber-500/15 border-amber-500/40'
            : 'bg-blue-500/15 border-blue-500/40'
        }`}>
          <AlertTriangle
            className={`flex-shrink-0 ${
              warningBadge.severity === 'critical'
                ? 'text-orange-400'
                : warningBadge.severity === 'warning'
                ? 'text-amber-400'
                : 'text-blue-400'
            }`}
            size={16}
          />
          <span className={`text-xs font-medium flex-1 ${
            warningBadge.severity === 'critical'
              ? 'text-orange-300'
              : warningBadge.severity === 'warning'
              ? 'text-amber-300'
              : 'text-blue-300'
          }`}>
            {warningBadge.text}
          </span>
          <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${
            warningBadge.severity === 'critical'
              ? 'bg-orange-500/30 text-orange-300'
              : warningBadge.severity === 'warning'
              ? 'bg-amber-500/30 text-amber-300'
              : 'bg-blue-500/30 text-blue-300'
          }`}>
            {warningBadge.count}
          </span>
        </div>
      )}

      {/* Compact Grid Metrics with optional Health Gauge */}
      {compact && agency.gridMetrics && agency.gridMetrics.length > 0 ? (
        <div className={agency.healthScore ? 'flex items-start gap-3' : ''}>
          {/* Health Score Gauge */}
          {agency.healthScore && (
            <div className="flex flex-col items-center flex-shrink-0">
              <HealthScoreGauge score={agency.healthScore} compact />
              {agency.healthLabel && (
                <span className={`text-[10px] font-medium mt-1 ${
                  agency.healthSeverity === 'critical' ? 'text-red-400'
                    : agency.healthSeverity === 'warning' ? 'text-amber-400'
                    : agency.healthSeverity === 'positive' ? 'text-emerald-400'
                    : 'text-blue-400'
                }`}>
                  {agency.healthLabel}
                </span>
              )}
            </div>
          )}
          {/* Grid Metrics */}
          <div className={`grid ${agency.gridMetrics.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'} gap-x-3 gap-y-2.5 flex-1 min-w-0`}>
            {agency.gridMetrics.map((gm, i) => (
              <div key={i} className="min-w-0">
                <p className="text-[#64748b] text-xs leading-tight truncate">{gm.label}</p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-base font-bold text-[#d4af37] truncate">{gm.value}</span>
                  {gm.badge && (
                    <span className={`text-[10px] font-medium px-1 py-px rounded whitespace-nowrap ${
                      gm.badgeColor === 'green' ? 'bg-emerald-500/20 text-emerald-400'
                        : gm.badgeColor === 'amber' ? 'bg-amber-500/20 text-amber-400'
                        : gm.badgeColor === 'red' ? 'bg-red-500/20 text-red-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {gm.badge}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Primary Metric with Sparkline */}
          {metrics?.[0] && (
            <div className={`flex items-end justify-between gap-2 ${compact ? '' : 'mb-4 pb-4 border-b border-[#2d3a52]'}`}>
              <div className="min-w-0 flex-1">
                <p className="text-[#64748b] text-xs mb-1">{metrics[0].label}</p>
                <p className={`${compact ? 'text-lg' : 'text-xl sm:text-2xl'} font-bold truncate ${metrics[0].highlight ? 'text-[#d4af37]' : 'text-white'}`}>
                  {metrics[0].value}
                </p>
              </div>
              {!compact && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {sparklineData && (
                    <Sparkline
                      data={sparklineData}
                      color={
                        status?.type === 'critical'
                          ? '#ef4444'
                          : status?.type === 'warning'
                          ? '#f59e0b'
                          : '#10b981'
                      }
                      height={28}
                      width={48}
                    />
                  )}
                  {trend != null && <TrendIndicator value={trend} />}
                </div>
              )}
            </div>
          )}

          {/* Secondary Metrics */}
          {!compact && (
            <div className="space-y-2.5">
              {metrics?.slice(1).map((metric, i) => (
                <div key={i} className="flex justify-between items-center gap-3">
                  <span className="text-[#94a3b8] text-sm flex-shrink-0">{metric.label}</span>
                  <span
                    className={`font-medium text-sm text-right ${
                      metric.status === 'good'
                        ? 'text-emerald-400'
                        : metric.status === 'warning'
                        ? 'text-amber-400'
                        : metric.status === 'critical'
                        ? 'text-red-400'
                        : 'text-white'
                    }`}
                  >
                    {metric.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
