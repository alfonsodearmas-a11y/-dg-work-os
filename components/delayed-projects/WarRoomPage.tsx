'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  Eye, RefreshCw, Upload, AlertTriangle,
  DollarSign, TrendingUp, Clock, Target, Gauge,
} from 'lucide-react';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { fmtCurrency } from '@/components/oversight/types';
import type { WarRoomSummary } from '@/lib/delayed-projects/types';
import { WarRoomKpiCard } from './shared';
import { UploadModal } from './UploadModal';
import { RiskOverviewTab } from './RiskOverviewTab';
import { ProjectRegistryTab } from './ProjectRegistryTab';
import { InterventionsTab } from './InterventionsTab';

type TabId = 'risk' | 'registry' | 'interventions';

export function WarRoomPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { effectiveUser } = useEffectiveUser();
  const isMobile = useIsMobile();

  const canUpload = effectiveUser.role === 'dg' || effectiveUser.role === 'ps';

  // ── State ──
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    (searchParams.get('tab') as TabId) || 'risk',
  );
  const [summary, setSummary] = useState<WarRoomSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // ── Data Fetching ──
  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/delayed-projects/summary');
      if (res.ok) setSummary(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchSummary().finally(() => setLoading(false));
  }, [fetchSummary]);

  // Sync tab to URL
  useEffect(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab !== activeTab) {
      const p = new URLSearchParams(searchParams.toString());
      p.set('tab', activeTab);
      router.replace(`/oversight?${p.toString()}`, { scroll: false });
    }
  }, [activeTab, router, searchParams]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSummary();
    setRefreshing(false);
  }, [fetchSummary]);

  const handleUploaded = useCallback(() => {
    fetchSummary();
  }, [fetchSummary]);

  // ── Tabs ──
  const tabs: Tab[] = [
    { id: 'risk', label: 'Risk Overview', icon: Target },
    { id: 'registry', label: 'Project Registry', icon: Eye, badge: summary?.total_projects },
    { id: 'interventions', label: 'Interventions', icon: AlertTriangle },
  ];

  // ── Loading State ──
  if (loading) {
    return (
      <div className="space-y-6">
        <HeaderSkeleton />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl border border-navy-800 p-4 bg-gradient-to-b from-[#1a2744] to-[#0f1d32] animate-pulse">
              <div className="w-9 h-9 rounded-lg bg-navy-800 mb-3" />
              <div className="h-7 w-16 bg-navy-800 rounded mb-1" />
              <div className="h-3 w-20 bg-navy-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Empty State ──
  const isEmpty = !summary || summary.total_projects === 0;

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Upload Modal */}
      <UploadModal isOpen={showUpload} onClose={() => setShowUpload(false)} onUploaded={handleUploaded} />

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gold-500/20 flex items-center justify-center shrink-0">
            <Eye className="h-4 w-4 md:h-5 md:w-5 text-gold-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-white">Delayed Projects Oversight</h1>
            <p className="text-navy-600 text-xs md:text-sm truncate">
              Intervention Tracking & Risk Intelligence
              {summary?.last_upload_date && (
                <> &middot; Updated {new Date(summary.last_upload_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canUpload && (
            <button
              onClick={() => setShowUpload(true)}
              className={`btn-gold px-3 py-2 text-sm flex items-center gap-2 ${isEmpty ? 'animate-[pulse-gold_2s_infinite]' : ''}`}
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Upload Data</span>
            </button>
          )}
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-navy-900 border border-navy-800 hover:border-gold-500 text-slate-400 hover:text-white transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline text-sm">Refresh</span>
          </button>
        </div>
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <div className="py-16">
          <EmptyState
            icon={<Upload className="h-12 w-12" />}
            title="No delayed projects tracked yet"
            description={canUpload
              ? 'Upload your first spreadsheet to begin tracking delayed projects.'
              : 'Project data has not been uploaded yet. Contact the DG or PS to upload data.'
            }
            action={canUpload ? (
              <button onClick={() => setShowUpload(true)} className="btn-gold px-4 py-2 text-sm mt-4">
                <Upload className="h-4 w-4 inline mr-2" />Upload Project Data
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <>
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <WarRoomKpiCard
              label="Total Delayed"
              value={summary!.total_projects.toLocaleString()}
              icon={AlertTriangle}
              accent="text-red-400"
              bgAccent="bg-red-500/15"
            />
            <WarRoomKpiCard
              label="Total Contract Value"
              value={fmtCurrency(summary!.total_contract_value / 100)}
              icon={DollarSign}
              accent="text-gold-400"
              bgAccent="bg-gold-500/15"
            />
            <WarRoomKpiCard
              label="Financial Exposure"
              value={fmtCurrency(summary!.total_exposure / 100)}
              icon={DollarSign}
              accent="text-amber-400"
              bgAccent="bg-amber-500/15"
              alert
            />
            <WarRoomKpiCard
              label="Avg. Completion"
              value={`${summary!.avg_completion}%`}
              icon={TrendingUp}
              accent="text-blue-400"
              bgAccent="bg-blue-500/15"
            />
            <WarRoomKpiCard
              label="Critical Projects"
              value={summary!.critical_count.toLocaleString()}
              icon={Gauge}
              accent={summary!.critical_count > 0 ? 'text-red-400' : 'text-emerald-400'}
              bgAccent={summary!.critical_count > 0 ? 'bg-red-500/15' : 'bg-emerald-500/15'}
              alert={summary!.critical_count > 0}
            />
            <WarRoomKpiCard
              label="Longest Overdue"
              value={summary!.longest_overdue > 0 ? `${summary!.longest_overdue}d` : '-'}
              icon={Clock}
              accent={summary!.longest_overdue > 365 ? 'text-red-400' : 'text-amber-400'}
              bgAccent={summary!.longest_overdue > 365 ? 'bg-red-500/15' : 'bg-amber-500/15'}
            />
          </div>

          {/* Tabs */}
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as TabId)}
            compactOnMobile
          >
            {activeTab === 'risk' && (
              <RiskOverviewTab summary={summary!} isMobile={isMobile} />
            )}
            {activeTab === 'registry' && (
              <ProjectRegistryTab
                isMobile={isMobile}
                onRefresh={handleRefresh}
              />
            )}
            {activeTab === 'interventions' && (
              <InterventionsTab isMobile={isMobile} onRefresh={handleRefresh} />
            )}
          </Tabs>
        </>
      )}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-3 animate-pulse">
      <div className="w-10 h-10 rounded-xl bg-navy-800" />
      <div>
        <div className="h-6 w-56 bg-navy-800 rounded mb-1" />
        <div className="h-3 w-40 bg-navy-800 rounded" />
      </div>
    </div>
  );
}
