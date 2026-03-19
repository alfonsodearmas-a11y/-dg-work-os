'use client';

import { memo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { DomainCard, MetricCard, DetailCell, DomainInsightCard } from './DomainCard';
import { formatGYD, resolveMetric } from '@/lib/gwi-metric-display';
import type { FinancialData } from './gwi-types';
import type { GWIInsights } from '@/lib/gwi-insights';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────────────────

interface FinancialDomainProps {
  fin: FinancialData;
  insights: GWIInsights | null;
}

export const FinancialDomain = memo(function FinancialDomain({ fin, insights }: FinancialDomainProps) {
  const profitD = resolveMetric(fin.net_profit, formatGYD, 'net_profit', fin._meta);
  const revenueD = resolveMetric(fin.total_revenue, formatGYD, 'total_revenue', fin._meta);
  const costD = resolveMetric(fin.operating_cost, formatGYD, 'operating_cost', fin._meta);
  const subvD = resolveMetric(fin.govt_subvention, formatGYD, 'govt_subvention', fin._meta);

  const primaryMetrics = (
    <>
      <MetricCard
        title="Net Profit/Loss"
        value={profitD.text}
        status={profitD.status !== 'value' ? 'muted' : (fin.net_profit && fin.net_profit > 0 ? 'good' : 'critical')}
        tooltip={profitD.tooltip}
        estimated={profitD.estimated}
        badge={profitD.status === 'value' ? <VarianceBadge actual={fin.net_profit} budget={fin.net_profit_budget} /> : undefined}
      />
      <MetricCard
        title="Total Revenue"
        value={revenueD.text}
        status={revenueD.status !== 'value' ? 'muted' : undefined}
        tooltip={revenueD.tooltip}
        estimated={revenueD.estimated}
      />
      <MetricCard
        title="Operating Cost"
        value={costD.text}
        status={costD.status !== 'value' ? 'muted' : (fin.operating_cost != null && fin.operating_cost_budget != null && fin.operating_cost < fin.operating_cost_budget ? 'good' : 'warning')}
        tooltip={costD.tooltip}
        estimated={costD.estimated}
        badge={costD.status === 'value' ? <VarianceBadge actual={fin.operating_cost} budget={fin.operating_cost_budget} inverse label="vs budget" /> : undefined}
      />
      <MetricCard
        title="Govt Subvention"
        value={subvD.text}
        status={subvD.status !== 'value' ? 'muted' : undefined}
        tooltip={subvD.tooltip}
        estimated={subvD.estimated}
      />
    </>
  );

  const revenueItems = [
    { label: 'Tariff Revenue', value: fin.tariff_revenue },
    { label: 'Other Operating Revenue', value: fin.other_operating_revenue },
    { label: 'Non-Operating Revenue', value: fin.non_operating_revenue },
    { label: 'Cash at Bank', value: fin.cash_at_bank },
    { label: 'Net Assets', value: fin.net_assets },
  ];

  const costItems = [
    { label: 'Employment', value: fin.employment_cost },
    { label: 'Premises', value: fin.premises_cost },
    { label: 'Supplies & Services', value: fin.supplies_services },
    { label: 'Transport', value: fin.transport_cost },
    { label: 'Administration', value: fin.admin_cost },
    { label: 'Depreciation', value: fin.depreciation },
  ];

  const balanceItems = [
    { label: 'Property & Equipment', value: fin.property_equipment },
    { label: 'Work in Progress', value: fin.work_in_progress },
    { label: 'Current Assets', value: fin.current_assets },
    { label: 'Current Liabilities', value: fin.current_liabilities },
    { label: 'Trade Payables', value: fin.trade_payables },
    { label: 'GPL Liability', value: fin.gpl_liability },
  ];

  const secondaryContent = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {revenueItems.map(item => (
          <DetailCell key={item.label} label={item.label} value={formatGYD(item.value)} />
        ))}
      </div>

      <div>
        <p className="text-slate-400 text-xs font-medium mb-2">Cost Breakdown</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {costItems.map(item => (
            <DetailCell key={item.label} label={item.label} value={formatGYD(item.value)} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-slate-400 text-xs font-medium mb-2">Balance Sheet</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {balanceItems.map(item => (
            <DetailCell key={item.label} label={item.label} value={formatGYD(item.value)} />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <DomainCard
      title="Financial Overview"
      score={insights?.financial?.score}
      primaryMetrics={primaryMetrics}
      secondaryContent={secondaryContent}
      insightContent={<DomainInsightCard insights={insights} domain="financial" />}
    />
  );
});
