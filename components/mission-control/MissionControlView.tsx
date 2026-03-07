'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  CheckSquare,
  AlertTriangle,
  TrendingUp,
  Clock,
  Plus,
  Sparkles,
} from 'lucide-react';
import { RefreshButton } from './RefreshButton';
import type { MissionControlData } from '@/lib/data/mission-control';

// ── Agency Config ────────────────────────────────────────────────────────────

const AGENCY_CONFIG: Record<string, {
  name: string;
  fullName: string;
  color: string;
  href: string | null;
}> = {
  gpl: { name: 'GPL', fullName: 'Guyana Power & Light', color: '#4a82f5', href: '/intel/gpl' },
  gwi: { name: 'GWI', fullName: 'Guyana Water Inc.', color: '#00c875', href: '/intel/gwi' },
  gcaa: { name: 'GCAA', fullName: 'Civil Aviation Authority', color: '#a25ddc', href: null },
  cjia: { name: 'CJIA', fullName: 'Cheddi Jagan Int\'l Airport', color: '#fb9d3b', href: null },
  heci: { name: 'HECI', fullName: 'Hinterland Electrification', color: '#579bfc', href: null },
  marad: { name: 'MARAD', fullName: 'Maritime Administration', color: '#00cec9', href: null },
  hinterland: { name: 'HSD', fullName: 'Hinterland Services', color: '#2da44e', href: null },
};

const AGENCY_ORDER = ['gpl', 'gwi', 'gcaa', 'cjia', 'heci', 'marad', 'hinterland'];

function scoreColor(score: number): string {
  if (score >= 90) return '#059669';
  if (score >= 75) return '#e2e8f0';
  if (score >= 60) return '#d4af37';
  return '#dc2626';
}

function scoreBarColor(score: number): string {
  if (score >= 90) return '#059669';
  if (score >= 75) return '#4a82f5';
  if (score >= 60) return '#d4af37';
  return '#dc2626';
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  data: MissionControlData;
  briefing: string;
  userName: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function MissionControlView({ data, briefing, userName }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'alerts'>('overview');

  const agencyMap = new Map(data.agencies.map(a => [a.agency_slug, a]));
  const liveCount = data.agencies.filter(a => a.status === 'live').length;
  const liveAgencies = data.agencies.filter(a => a.status === 'live' && a.health_score !== null);
  const avgHealth = liveAgencies.length > 0
    ? Math.round(liveAgencies.reduce((s, a) => s + (a.health_score ?? 0), 0) / liveAgencies.length)
    : 0;

  const lastSynced = data.agencies.length > 0
    ? new Date(Math.max(...data.agencies.map(a => new Date(a.computed_at).getTime()))).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'N/A';

  const now = new Date();
  const briefingTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Mission Control</h1>
              <p className="text-[#64748b] text-xs md:text-sm mt-0.5">
                {data.agencies.length} agencies &middot; last synced {lastSynced}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <RefreshButton />
              <Link
                href="/tasks"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#d4af37] hover:bg-[#b8860b] transition-colors text-sm font-semibold text-[#0a1628]"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">New Task</span>
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex gap-1 border-b border-[#2d3a52]/50">
            {(['overview', 'analytics', 'alerts'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? 'text-[#d4af37] border-[#d4af37]'
                    : 'text-[#64748b] border-transparent hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'overview' && (
          <>
            {/* KPI Stat Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard
                label="Agencies live"
                value={liveCount}
                icon={<Building2 size={16} />}
                accent="#4a82f5"
              />
              <StatCard
                label="Avg health"
                value={liveAgencies.length > 0 ? avgHealth : '--'}
                suffix={liveAgencies.length > 0 ? '/100' : undefined}
                icon={<TrendingUp size={16} />}
                accent="#059669"
              />
              <StatCard
                label="Open tasks"
                value={data.openTasks}
                icon={<CheckSquare size={16} />}
                accent="#d4af37"
              />
              <StatCard
                label="Overdue"
                value={data.overdueTasks}
                icon={<Clock size={16} />}
                accent={data.overdueTasks > 0 ? '#dc2626' : '#64748b'}
              />
              <StatCard
                label="Active alerts"
                value={data.activeAlerts}
                icon={<AlertTriangle size={16} />}
                accent={data.activeAlerts > 0 ? '#fb9d3b' : '#64748b'}
              />
            </div>

            {/* Agency Grid */}
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
              {AGENCY_ORDER.map(slug => {
                const snapshot = agencyMap.get(slug);
                const config = AGENCY_CONFIG[slug];
                if (!config) return null;

                const isLive = snapshot?.status === 'live';
                const score = snapshot?.health_score ?? null;
                const kpi = snapshot?.kpi_snapshot as Record<string, unknown> | null;
                const pendingCount = slug === 'gpl' ? data.gplPendingApplications : slug === 'gwi' ? data.gwiPendingApplications : 0;

                if (isLive && config.href) {
                  return (
                    <Link key={slug} href={config.href} className="block">
                      <LiveAgencyCard
                        name={config.name}
                        fullName={config.fullName}
                        color={config.color}
                        score={score}
                        kpi={kpi}
                        pendingCount={slug === 'gpl' ? pendingCount : undefined}
                      />
                    </Link>
                  );
                }

                return (
                  <BuildingAgencyCard
                    key={slug}
                    name={config.name}
                    fullName={config.fullName}
                    color={config.color}
                  />
                );
              })}
            </div>
          </>
        )}

        {activeTab === 'analytics' && (
          <div className="card-premium p-8 text-center">
            <p className="text-[#64748b] text-sm">Analytics view coming soon.</p>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="card-premium p-8 text-center">
            <p className="text-[#64748b] text-sm">Alerts view coming soon.</p>
          </div>
        )}

        {/* AI Briefing — inline */}
        {briefing && (
          <div className="rounded-xl border border-[#d4af37]/30 bg-gradient-to-br from-[#1a2744] to-[#0f1d35] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-[#d4af37]" />
              <span className="text-xs font-semibold text-[#d4af37]">Claude Briefing</span>
              <span className="text-xs text-[#64748b] ml-auto">{briefingTime}</span>
            </div>
            <p className="text-sm text-[#94a3b8] italic leading-relaxed">{briefing}</p>
          </div>
        )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, suffix, icon, accent }: {
  label: string;
  value: number | string;
  suffix?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="card-premium p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${accent}20`, color: accent }}
        >
          {icon}
        </div>
        <span className="text-xs uppercase tracking-wider text-[#64748b] font-semibold">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-white">{value}</span>
        {suffix && <span className="text-xs text-[#64748b]">{suffix}</span>}
      </div>
    </div>
  );
}

function LiveAgencyCard({ name, fullName, color, score, kpi, pendingCount }: {
  name: string;
  fullName: string;
  color: string;
  score: number | null;
  kpi: Record<string, unknown> | null;
  pendingCount?: number;
}) {
  const displayScore = score ?? 0;
  const kpiLabel = (kpi?.label as string) || null;
  const kpiEntries = kpi ? Object.entries(kpi).filter(([k]) => k !== 'label') : [];

  return (
    <div className="agency-card card-premium overflow-hidden group cursor-pointer">
      {/* Color strip */}
      <div className="h-1" style={{ backgroundColor: color }} />

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-white">{name}</p>
            <p className="text-xs text-[#64748b] leading-tight">{fullName}</p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#059669]/15 text-[#059669]">
            Live
          </span>
        </div>

        {/* Score */}
        {score !== null && (
          <div>
            <span className="text-3xl font-bold" style={{ color: scoreColor(displayScore) }}>
              {displayScore}
            </span>
            <span className="text-xs text-[#64748b] ml-1">/100</span>
          </div>
        )}

        {/* Score bar */}
        <div className="w-full h-1.5 rounded-full bg-[#2d3a52]">
          <div
            className="h-full rounded-full transition-all duration-[1400ms] ease-out"
            style={{
              width: `${displayScore}%`,
              backgroundColor: scoreBarColor(displayScore),
            }}
          />
        </div>

        {/* KPI values */}
        {kpiEntries.length > 0 && (
          <div className="space-y-1">
            {kpiLabel && (
              <p className="text-xs text-[#64748b] font-medium uppercase tracking-wider">{kpiLabel}</p>
            )}
            <div className="flex gap-3">
              {kpiEntries.map(([key, val]) => (
                <div key={key} className="text-xs">
                  <span className="text-[#64748b]">{key}: </span>
                  <span className="text-white font-medium">{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending applications (GPL) */}
        {pendingCount !== undefined && pendingCount > 0 && (
          <div className="text-xs">
            <span className="text-[#64748b]">Pending applications: </span>
            <span className="text-[#d4af37] font-semibold">{pendingCount.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BuildingAgencyCard({ name, fullName, color }: {
  name: string;
  fullName: string;
  color: string;
}) {
  return (
    <div className="card-premium overflow-hidden opacity-70">
      {/* Color strip */}
      <div className="h-1" style={{ backgroundColor: color }} />

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-white">{name}</p>
            <p className="text-xs text-[#64748b] leading-tight">{fullName}</p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#2d3a52] text-[#64748b]">
            Building
          </span>
        </div>

        <div>
          <span className="text-3xl font-bold text-[#2d3a52]">&mdash;</span>
        </div>

        <div className="w-full h-1.5 rounded-full bg-[#2d3a52]" />

        <p className="text-xs text-[#64748b] italic">Intel panel in development</p>
      </div>
    </div>
  );
}

