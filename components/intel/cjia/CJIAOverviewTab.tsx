'use client';

import { Package } from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { InsightCard, type InsightCardData } from '@/components/ui/InsightCard';
import type { CJIAData } from '@/data/mockData';

// ── Types ───────────────────────────────────────────────────────────────────

interface CJIAOverviewTabProps {
  data?: CJIAData;
  operationsInsights?: InsightCardData[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toLocaleString();
}

function formatPct(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '--';
  return `${value.toFixed(1)}%`;
}

// ── KPI Card ────────────────────────────────────────────────────────────────

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
    neutral: 'text-slate-100',
  }[status];

  return (
    <div className="bg-navy-900 rounded-xl border border-navy-800 p-3 md:p-5">
      <p className="text-slate-400 text-[15px] mb-2">{title}</p>
      <p className={`text-xl md:text-[32px] font-bold leading-tight ${valueColor}`}>{value}</p>
      {badge && <div className="mt-2">{badge}</div>}
      {subtitle && <p className="text-navy-600 text-sm mt-1">{subtitle}</p>}
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function CJIAOverviewTab({ data, operationsInsights }: CJIAOverviewTabProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-slate-100 font-medium text-[22px]">Airport Operations</h3>

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
              <p className="text-navy-600 text-xs mb-1">Arrived</p>
              <p className="text-lg font-bold text-teal-400">
                {formatNumber(data.ytdCargoArrived)} <span className="text-xs font-normal text-navy-600">KG</span>
              </p>
            </div>
            <div>
              <p className="text-navy-600 text-xs mb-1">Departed</p>
              <p className="text-lg font-bold text-cyan-400">
                {formatNumber(data.ytdCargoDeparted)} <span className="text-xs font-normal text-navy-600">KG</span>
              </p>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* AI Insights */}
      {operationsInsights && operationsInsights.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-gold-500 font-semibold">AI Operations Insights</p>
          {operationsInsights.map((card, i) => (
            <InsightCard key={i} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}
