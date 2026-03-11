'use client';

import { useMemo } from 'react';
import {
  DollarSign, Users, ShieldAlert, FileText, AlertTriangle,
} from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { InsightCard } from '@/components/ui/InsightCard';
import type { GWIInsights } from '@/lib/gwi-insights';

// ── Types ───────────────────────────────────────────────────────────────────

export interface CollectionsData {
  total_collections?: number;
  ytd_collections?: number;
  total_billings?: number;
  active_accounts?: number;
  accounts_receivable?: number;
  on_time_payment_pct?: number;
  region_1_collections?: number;
  region_2_collections?: number;
  region_3_collections?: number;
  region_4_collections?: number;
  region_5_collections?: number;
  billing_efficiency_pct?: number;
  arrears_30_days?: number;
  arrears_60_days?: number;
  arrears_90_plus_days?: number;
}

export interface CustomerServiceData {
  total_complaints?: number;
  resolved_complaints?: number;
  resolution_rate_pct?: number;
  within_timeline_pct?: number;
  unresolved_complaints?: number;
  avg_resolution_days?: number;
  disconnections?: number;
  reconnections?: number;
  reconnection_payments?: number;
  legal_actions?: number;
  enforcement_actions?: number;
  puc_complaints?: number;
  puc_resolved?: number;
}

interface GWIMetricsTabProps {
  activeTab: 'collections' | 'customer_service';
  coll: CollectionsData;
  cs: CustomerServiceData;
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

function formatNum(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '--';
  return value.toLocaleString();
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

// ── Collections Tab ──────────────────────────────────────────────────────────

function CollectionsTab({ coll, insights, reportMonth }: {
  coll: CollectionsData;
  insights: GWIInsights | null;
  reportMonth: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-slate-100 font-medium text-lg md:text-[22px]">Collections & Billing</h3>
        <ScheduleBadge frequency="Monthly" lastUpdated={reportMonth} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <KPICard
          title="Total Collections"
          value={formatGYD(coll.total_collections)}
          status="good"
        />
        <KPICard
          title="YTD Collections"
          value={formatGYD(coll.ytd_collections)}
        />
        <KPICard
          title="Total Billings"
          value={formatGYD(coll.total_billings)}
        />
        <KPICard
          title="Active Accounts"
          value={formatNum(coll.active_accounts)}
        />
        <KPICard
          title="Accounts Receivable"
          value={formatGYD(coll.accounts_receivable)}
          status={coll.accounts_receivable && coll.accounts_receivable > 2_000_000_000 ? 'warning' : 'neutral'}
        />
        <KPICard
          title="On-time Payments"
          value={formatPct(coll.on_time_payment_pct)}
          status={coll.on_time_payment_pct != null && coll.on_time_payment_pct < 50 ? 'critical' : coll.on_time_payment_pct != null && coll.on_time_payment_pct < 70 ? 'warning' : 'good'}
        />
      </div>

      {/* Regional Collections */}
      <CollapsibleSection
        title="Regional Collections"
        icon={DollarSign}
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Region 1', value: coll.region_1_collections },
            { label: 'Region 2', value: coll.region_2_collections },
            { label: 'Region 3', value: coll.region_3_collections },
            { label: 'Region 4', value: coll.region_4_collections },
            { label: 'Region 5', value: coll.region_5_collections },
          ].map(item => (
            <div key={item.label} className="bg-navy-950 rounded-lg p-3 border border-navy-800">
              <p className="text-navy-600 text-xs mb-1">{item.label}</p>
              <p className="text-lg font-bold text-slate-100">{formatGYD(item.value)}</p>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Billing Performance */}
      <CollapsibleSection
        title="Billing Performance"
        icon={FileText}
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">Billing Efficiency</p>
            <p className="text-lg font-bold text-slate-100">{formatPct(coll.billing_efficiency_pct)}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">Active Accounts</p>
            <p className="text-lg font-bold text-slate-100">{formatNum(coll.active_accounts)}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">On-time Payment Rate</p>
            <p className={`text-lg font-bold ${(coll.on_time_payment_pct ?? 0) < 50 ? 'text-red-400' : 'text-slate-100'}`}>
              {formatPct(coll.on_time_payment_pct)}
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Arrears Recovery */}
      <CollapsibleSection
        title="Arrears Recovery"
        icon={AlertTriangle}
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">30-Day Arrears</p>
            <p className="text-lg font-bold text-amber-400">{formatGYD(coll.arrears_30_days)}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">60-Day Arrears</p>
            <p className="text-lg font-bold text-amber-400">{formatGYD(coll.arrears_60_days)}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">90+ Day Arrears</p>
            <p className="text-lg font-bold text-red-400">{formatGYD(coll.arrears_90_plus_days)}</p>
          </div>
        </div>
      </CollapsibleSection>

      {/* AI Insight */}
      {insights?.operational && (
        <InsightCard
          card={{
            emoji: '\uD83D\uDCCA',
            title: insights.operational.headline || 'Collections Analysis',
            severity: insights.operational.severity || 'stable',
            summary: insights.operational.summary || '',
            detail: insights.operational.recommendations?.join('\n') || null,
          }}
        />
      )}
    </div>
  );
}

// ── Customer Service Tab ─────────────────────────────────────────────────────

function CustomerServiceTab({ cs, insights, reportMonth }: {
  cs: CustomerServiceData;
  insights: GWIInsights | null;
  reportMonth: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-slate-100 font-medium text-lg md:text-[22px]">Customer Service</h3>
        <ScheduleBadge frequency="Monthly" lastUpdated={reportMonth} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <KPICard
          title="Complaints"
          value={formatNum(cs.total_complaints)}
        />
        <KPICard
          title="Resolved"
          value={`${formatNum(cs.resolved_complaints)} / ${formatPct(cs.resolution_rate_pct)}`}
          status={(cs.resolution_rate_pct ?? 0) >= 85 ? 'good' : 'warning'}
        />
        <KPICard
          title="Within Timeline"
          value={formatPct(cs.within_timeline_pct)}
          status={(cs.within_timeline_pct ?? 0) >= 80 ? 'good' : (cs.within_timeline_pct ?? 0) >= 60 ? 'warning' : 'critical'}
        />
        <KPICard
          title="Unresolved"
          value={formatNum(cs.unresolved_complaints)}
          status={(cs.unresolved_complaints ?? 0) > 200 ? 'critical' : (cs.unresolved_complaints ?? 0) > 100 ? 'warning' : 'good'}
        />
        <KPICard
          title="Disconnections"
          value={formatNum(cs.disconnections)}
        />
        <KPICard
          title="Reconnections"
          value={formatNum(cs.reconnections)}
          status={(cs.reconnections ?? 0) > (cs.disconnections ?? 0) ? 'good' : 'warning'}
        />
      </div>

      {/* Resolution Performance */}
      <CollapsibleSection
        title="Resolution Performance"
        icon={ShieldAlert}
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">Total Complaints</p>
            <p className="text-lg font-bold text-slate-100">{formatNum(cs.total_complaints)}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">Resolution Rate</p>
            <p className="text-lg font-bold text-emerald-400">{formatPct(cs.resolution_rate_pct)}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">Avg Resolution Time</p>
            <p className="text-lg font-bold text-slate-100">{cs.avg_resolution_days ?? '--'} days</p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Arrears Actions */}
      <CollapsibleSection
        title="Arrears Actions"
        icon={Users}
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">Reconnection Payments</p>
            <p className="text-lg font-bold text-slate-100">{formatGYD(cs.reconnection_payments)}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">Legal Actions</p>
            <p className="text-lg font-bold text-amber-400">{cs.legal_actions ?? '--'}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">Enforcement Actions</p>
            <p className="text-lg font-bold text-amber-400">{cs.enforcement_actions ?? '--'}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">Disconnections</p>
            <p className="text-lg font-bold text-red-400">{formatNum(cs.disconnections)}</p>
          </div>
        </div>
      </CollapsibleSection>

      {/* PUC Matters */}
      <CollapsibleSection
        title="PUC Matters"
        icon={FileText}
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">PUC Complaints</p>
            <p className="text-lg font-bold text-slate-100">{cs.puc_complaints ?? '--'}</p>
          </div>
          <div className="bg-navy-950 rounded-lg p-3 border border-navy-800">
            <p className="text-navy-600 text-xs mb-1">PUC Resolved</p>
            <p className="text-lg font-bold text-emerald-400">{cs.puc_resolved ?? '--'}</p>
          </div>
        </div>
      </CollapsibleSection>

      {/* AI Insight */}
      {insights?.customer_service && (
        <InsightCard
          card={{
            emoji: '\uD83D\uDC65',
            title: insights.customer_service.headline || 'Customer Service Analysis',
            severity: insights.customer_service.severity || 'stable',
            summary: insights.customer_service.summary || '',
            detail: insights.customer_service.recommendations?.join('\n') || null,
          }}
        />
      )}
    </div>
  );
}

// ── Main Export ──────────────────────────────────────────────────────────────

export function GWIMetricsTab({ activeTab, coll, cs, insights, reportMonth }: GWIMetricsTabProps) {
  if (activeTab === 'collections') {
    return <CollectionsTab coll={coll} insights={insights} reportMonth={reportMonth} />;
  }
  return <CustomerServiceTab cs={cs} insights={insights} reportMonth={reportMonth} />;
}
