'use client';

import { useMemo } from 'react';
import {
  ShoppingCart, Package, AlertTriangle,
} from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { InsightCard } from '@/components/ui/InsightCard';
import type { GWIInsights } from '@/lib/gwi-insights';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ProcurementData {
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

interface GWITrendsTabProps {
  proc: ProcurementData;
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

function formatPct(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '--';
  return `${value.toFixed(1)}%`;
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

function ContractTable({ data, title }: {
  data?: Record<string, { count: number; value: number }>;
  title: string;
}) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div>
      <p className="text-slate-400 text-sm font-medium mb-2">{title}</p>
      <table className="w-full text-sm" aria-label={title}>
        <thead>
          <tr className="border-b border-navy-800">
            <th scope="col" className="text-left py-2 text-navy-600 font-medium">Type</th>
            <th scope="col" className="text-right py-2 text-navy-600 font-medium">Count</th>
            <th scope="col" className="text-right py-2 text-navy-600 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(data).map(([type, info]) => (
            <tr key={type} className="border-b border-navy-800/30">
              <td className="py-2 text-slate-100 capitalize">{type}</td>
              <td className="py-2 text-right text-slate-400">{info.count}</td>
              <td className="py-2 text-right text-slate-100 font-medium">{formatGYD(info.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function GWITrendsTab({ proc, insights, reportMonth }: GWITrendsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-slate-100 font-medium text-lg md:text-[22px]">Procurement</h3>
        <ScheduleBadge frequency="Monthly" lastUpdated={reportMonth} />
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
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">Total Inventory Value</p>
            <p className="text-lg font-bold text-slate-100">{formatGYD(proc.inventory_value)}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">Receipts</p>
            <p className="text-lg font-bold text-emerald-400">{formatGYD(proc.inventory_receipts)}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">Issues</p>
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
  );
}
