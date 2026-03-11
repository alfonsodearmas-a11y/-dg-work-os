'use client';

import { useMemo } from 'react';
import {
  DollarSign, Receipt, Scale, TrendingUp, TrendingDown, AlertTriangle,
} from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { InsightCard } from '@/components/ui/InsightCard';
import type { GWIInsights } from '@/lib/gwi-insights';

// ── Types ───────────────────────────────────────────────────────────────────

export interface FinancialData {
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

interface GWIOverviewTabProps {
  fin: FinancialData;
  insights: GWIInsights | null;
  reportMonth: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatGYD(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '--';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

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

interface KPICardProps {
  title: string;
  value: string;
  badge?: React.ReactNode;
  status?: 'good' | 'warning' | 'critical' | 'neutral';
}

function KPICard({ title, value, badge, status = 'neutral' }: KPICardProps) {
  const valueColor = useMemo(() => ({
    good: 'text-emerald-400',
    warning: 'text-amber-400',
    critical: 'text-red-400',
    neutral: 'text-slate-100',
  })[status], [status]);

  return (
    <div className="bg-navy-900 rounded-xl border border-navy-800 p-3 md:p-5">
      <p className="text-slate-400 text-[13px] md:text-[15px] mb-2">{title}</p>
      <p className={`text-xl md:text-[32px] font-bold leading-tight ${valueColor}`}>{value}</p>
      {badge && <div className="mt-2">{badge}</div>}
    </div>
  );
}

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
        <span className={`text-xs ${isOverdue ? 'text-amber-400' : 'text-navy-600'}`}>
          {isOverdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
          Updated {new Date(lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function GWIOverviewTab({ fin, insights, reportMonth }: GWIOverviewTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-slate-100 font-medium text-lg md:text-[22px]">Financial Overview</h3>
        <ScheduleBadge frequency="Monthly" lastUpdated={reportMonth} />
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
          <div className="bg-navy-950 rounded-lg p-3 md:p-4 border border-navy-800">
            <p className="text-navy-600 text-sm mb-1">Tariff Revenue</p>
            <p className="text-lg md:text-xl font-bold text-slate-100">{formatGYD(fin.tariff_revenue)}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 md:p-4 border border-navy-800">
            <p className="text-navy-600 text-sm mb-1">Other Operating Revenue</p>
            <p className="text-lg md:text-xl font-bold text-slate-100">{formatGYD(fin.other_operating_revenue)}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 md:p-4 border border-navy-800">
            <p className="text-navy-600 text-sm mb-1">Non-Operating Revenue</p>
            <p className="text-lg md:text-xl font-bold text-slate-100">{formatGYD(fin.non_operating_revenue)}</p>
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
            <div key={item.label} className="bg-navy-950 rounded-lg p-3 border border-navy-800">
              <p className="text-navy-600 text-xs mb-1">{item.label}</p>
              <p className="text-lg font-bold text-slate-100">{formatGYD(item.value)}</p>
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
            <div key={item.label} className="bg-navy-950 rounded-lg p-3 border border-navy-800">
              <p className="text-navy-600 text-xs mb-1">{item.label}</p>
              <p className="text-lg font-bold text-slate-100">{formatGYD(item.value)}</p>
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
  );
}
