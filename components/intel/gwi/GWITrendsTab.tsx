'use client';

import { memo } from 'react';
import { DomainCard, MetricCard, DetailCell, DomainInsightCard } from './DomainCard';
import { formatGYD, formatPct, hasValue } from '@/lib/gwi-metric-display';
import type { ProcurementData } from './gwi-types';
import type { GWIInsights } from '@/lib/gwi-insights';

// ── Helpers ──────────────────────────────────────────────────────────────────

function ContractTable({ data, title }: {
  data?: Record<string, { count: number; value: number }>;
  title: string;
}) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div>
      <p className="text-slate-400 text-xs font-medium mb-2">{title}</p>
      <table className="w-full text-sm" aria-label={title}>
        <thead>
          <tr className="border-b border-navy-800">
            <th scope="col" className="text-left py-1.5 text-navy-600 font-medium text-xs">Type</th>
            <th scope="col" className="text-right py-1.5 text-navy-600 font-medium text-xs">Count</th>
            <th scope="col" className="text-right py-1.5 text-navy-600 font-medium text-xs">Value</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(data).map(([type, info]) => (
            <tr key={type} className="border-b border-navy-800/30">
              <td className="py-1.5 text-slate-100 text-xs capitalize">{type}</td>
              <td className="py-1.5 text-right text-slate-400 text-xs">{info.count}</td>
              <td className="py-1.5 text-right text-slate-100 font-medium text-xs">{formatGYD(info.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface ProcurementDomainProps {
  proc: ProcurementData;
  insights: GWIInsights | null;
}

export const ProcurementDomain = memo(function ProcurementDomain({ proc, insights }: ProcurementDomainProps) {
  const primaryMetrics = (
    <>
      <MetricCard
        title="Total Purchases"
        value={formatGYD(proc.total_purchases)}
        status={hasValue(proc.total_purchases) ? 'neutral' : 'muted'}
      />
      <MetricCard
        title="GOG Funded"
        value={hasValue(proc.gog_funded) ? `${formatGYD(proc.gog_funded)} / ${formatPct(proc.gog_funded_pct)}` : 'N/R'}
        status={hasValue(proc.gog_funded) ? 'neutral' : 'muted'}
      />
      <MetricCard
        title="GWI Funded"
        value={hasValue(proc.gwi_funded) ? `${formatGYD(proc.gwi_funded)} / ${formatPct(proc.gwi_funded_pct)}` : 'N/R'}
        status={hasValue(proc.gwi_funded) ? 'neutral' : 'muted'}
      />
      <MetricCard
        title="Major Contracts"
        value={hasValue(proc.major_contracts_count) ? `${proc.major_contracts_count} @ ${formatGYD(proc.major_contracts_value)}` : 'N/R'}
        status={hasValue(proc.major_contracts_count) ? 'neutral' : 'muted'}
      />
    </>
  );

  const secondaryContent = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <DetailCell
          label="Minor Contracts"
          value={hasValue(proc.minor_contracts_count) ? `${proc.minor_contracts_count} @ ${formatGYD(proc.minor_contracts_value)}` : 'N/R'}
        />
        <DetailCell label="Inventory Value" value={formatGYD(proc.inventory_value)} />
        <DetailCell label="Inventory Receipts" value={formatGYD(proc.inventory_receipts)} color={hasValue(proc.inventory_receipts) ? 'text-emerald-400' : undefined} />
        <DetailCell label="Inventory Issues" value={formatGYD(proc.inventory_issues)} color={hasValue(proc.inventory_issues) ? 'text-amber-400' : undefined} />
      </div>

      <ContractTable data={proc.major_contracts_by_type} title="Major Contracts by Type" />
      <ContractTable data={proc.minor_contracts_by_type} title="Minor Contracts by Type" />
    </div>
  );

  return (
    <DomainCard
      title="Procurement"
      score={insights?.procurement?.score}
      primaryMetrics={primaryMetrics}
      secondaryContent={secondaryContent}
      insightContent={<DomainInsightCard insights={insights} domain="procurement" />}
    />
  );
});
