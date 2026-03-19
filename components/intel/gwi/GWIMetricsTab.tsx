'use client';

import { memo } from 'react';
import { DomainCard, MetricCard, DetailCell, DomainInsightCard, thresholdStatus, STATUS_COLORS, type MetricStatusColor } from './DomainCard';
import { formatGYD, formatNum, formatPct, hasValue } from '@/lib/gwi-metric-display';
import type { CollectionsData, CustomerServiceData } from './gwi-types';
import type { GWIInsights } from '@/lib/gwi-insights';

// ── Collections Domain ──────────────────────────────────────────────────────

interface CollectionsDomainProps {
  coll: CollectionsData;
  insights: GWIInsights | null;
}

export const CollectionsDomain = memo(function CollectionsDomain({ coll, insights }: CollectionsDomainProps) {
  const primaryMetrics = (
    <>
      <MetricCard
        title="Total Collected"
        value={formatGYD(coll.total_collections)}
        status={hasValue(coll.total_collections) ? 'good' : 'muted'}
      />
      <MetricCard
        title="Total Billed"
        value={formatGYD(coll.total_billings)}
        status={hasValue(coll.total_billings) ? 'neutral' : 'muted'}
      />
      <MetricCard
        title="Billing Efficiency"
        value={formatPct(coll.billing_efficiency_pct)}
        status={thresholdStatus(coll.billing_efficiency_pct, 90, 70)}
      />
      <MetricCard
        title="Accounts Receivable"
        value={formatGYD(coll.accounts_receivable)}
        status={!hasValue(coll.accounts_receivable) ? 'muted'
          : (coll.accounts_receivable > 2_000_000_000 ? 'warning' : 'neutral')}
      />
    </>
  );

  const secondaryContent = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <DetailCell
          label="On-time Payment Rate"
          value={formatPct(coll.on_time_payment_pct)}
          color={hasValue(coll.on_time_payment_pct) ? STATUS_COLORS[thresholdStatus(coll.on_time_payment_pct, 60, 45)] : undefined}
        />
        <DetailCell label="YTD Collections" value={formatGYD(coll.ytd_collections)} />
        <DetailCell label="Regional Total" value={formatGYD(coll.regional_collections_total)} />
        <DetailCell label="Key Accounts" value={formatGYD(coll.key_accounts_collections)} />
        <DetailCell label="Active Accounts" value={formatNum(coll.active_accounts)} />
        {hasValue(coll.arrears_debt_reduction) && (
          <DetailCell
            label="Arrears Reduction"
            value={formatGYD(coll.arrears_debt_reduction)}
            color="text-emerald-400"
            subtitle={hasValue(coll.arrears_debt_reduction_pct) ? `${coll.arrears_debt_reduction_pct.toFixed(1)}% reduction` : undefined}
          />
        )}
      </div>

      {/* Regional Billings */}
      {(hasValue(coll.region_2_billings) || hasValue(coll.region_3_billings)) && (
        <div>
          <p className="text-slate-400 text-xs font-medium mb-2">Regional Billings</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {[
              { label: 'Region 2', value: coll.region_2_billings },
              { label: 'Region 3', value: coll.region_3_billings },
              { label: 'Region 4', value: coll.region_4_billings },
              { label: 'Region 5', value: coll.region_5_billings },
              { label: 'Region 6', value: coll.region_6_billings },
              { label: 'Region 7', value: coll.region_7_billings },
              { label: 'Region 8', value: coll.region_8_billings },
              { label: 'Region 9', value: coll.region_9_billings },
              { label: 'Region 10', value: coll.region_10_billings },
              { label: 'Hinterland', value: coll.hinterland_billings },
            ].map(item => (
              <DetailCell key={item.label} label={item.label} value={formatGYD(item.value)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <DomainCard
      title="Collections & Billing"
      score={insights?.operational?.score}
      primaryMetrics={primaryMetrics}
      secondaryContent={secondaryContent}
      insightContent={<DomainInsightCard insights={insights} domain="operational" />}
    />
  );
});

// ── Customer Service Domain ─────────────────────────────────────────────────

interface CustomerServiceDomainProps {
  cs: CustomerServiceData;
  insights: GWIInsights | null;
}

export const CustomerServiceDomain = memo(function CustomerServiceDomain({ cs, insights }: CustomerServiceDomainProps) {
  const primaryMetrics = (
    <>
      <MetricCard
        title="Resolution Rate"
        value={formatPct(cs.resolution_rate_pct)}
        status={thresholdStatus(cs.resolution_rate_pct, 85, 70)}
      />
      <MetricCard
        title="Within Timeline"
        value={formatPct(cs.within_timeline_pct)}
        status={thresholdStatus(cs.within_timeline_pct, 80, 60)}
      />
      <MetricCard
        title="Disconnections"
        value={formatNum(cs.disconnections)}
        status={hasValue(cs.disconnections) ? 'neutral' : 'muted'}
      />
      <MetricCard
        title="Reconnections"
        value={formatNum(cs.reconnections)}
        status={!hasValue(cs.reconnections) ? 'muted'
          : ((cs.reconnections ?? 0) > (cs.disconnections ?? 0) ? 'good' : 'warning')}
      />
    </>
  );

  const unresolvedStatus: MetricStatusColor = !hasValue(cs.unresolved_complaints) ? 'muted'
    : (cs.unresolved_complaints > 200 ? 'critical' : cs.unresolved_complaints > 100 ? 'warning' : 'good');

  const secondaryContent = (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <DetailCell label="Total Complaints" value={formatNum(cs.total_complaints)} />
      <DetailCell
        label="Unresolved"
        value={formatNum(cs.unresolved_complaints)}
        color={STATUS_COLORS[unresolvedStatus]}
      />
      <DetailCell label="Reconnection Payments" value={formatGYD(cs.reconnection_payments)} />
      <DetailCell label="Legal Collections" value={formatGYD(cs.legal_actions_amount ?? cs.legal_actions)} color={hasValue(cs.legal_actions_amount) ? 'text-amber-400' : undefined} />
      <DetailCell label="Enforcement Collections" value={formatGYD(cs.enforcement_actions_amount ?? cs.enforcement_actions)} color={hasValue(cs.enforcement_actions_amount) ? 'text-amber-400' : undefined} />
      <DetailCell label="PUC Complaints" value={formatNum(cs.puc_complaints)} />
      {hasValue(cs.puc_resolved) && (
        <DetailCell label="PUC Resolved" value={formatNum(cs.puc_resolved)} color="text-emerald-400" />
      )}
      <DetailCell
        label="Avg Resolution Time"
        value={hasValue(cs.avg_resolution_days) ? `${cs.avg_resolution_days.toFixed(0)}d` : 'N/R'}
      />
    </div>
  );

  return (
    <DomainCard
      title="Customer Service"
      score={insights?.customer_service?.score}
      primaryMetrics={primaryMetrics}
      secondaryContent={secondaryContent}
      insightContent={<DomainInsightCard insights={insights} domain="customer_service" />}
    />
  );
});
