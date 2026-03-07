'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  ClipboardList,
  LayoutDashboard,
  Zap,
  Droplets,
  Upload,
  ShieldAlert,
} from 'lucide-react';
import { OverviewTab } from '@/components/intel/pending-applications/OverviewTab';
import { UploadPanel } from '@/components/intel/pending-applications/UploadPanel';

// Lazy-load chart-heavy components
const TrendCharts = dynamic(
  () => import('@/components/intel/pending-applications/TrendCharts').then(m => ({ default: m.TrendCharts })),
  { ssr: false, loading: () => <div className="skeleton skeleton-chart card-premium" /> }
);
const GPLModule = dynamic(
  () => import('@/components/intel/gpl/GPLModule').then(m => ({ default: m.GPLModule })),
  { loading: () => <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="skeleton skeleton-card card-premium" />)}</div> }
);
const GWIAnalysisPanel = dynamic(
  () => import('@/components/intel/pending-applications/GWIAnalysisPanel').then(m => ({ default: m.GWIAnalysisPanel })),
  { loading: () => <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="skeleton skeleton-card card-premium" />)}</div> }
);

type Tab = 'overview' | 'gpl' | 'gwi' | 'upload';

const ALL_TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'gpl', label: 'GPL Analysis', icon: Zap },
  { key: 'gwi', label: 'GWI Analysis', icon: Droplets },
  { key: 'upload', label: 'Upload', icon: Upload },
];

interface Props {
  isDG: boolean;
  userAgency: string | null;
  refreshKey?: number;
}

export default function PendingApplicationsClient({ isDG, userAgency }: Props) {
  // GPL-only users see restricted tabs
  const allowedTabs = isDG
    ? ALL_TABS
    : userAgency === 'gpl'
      ? ALL_TABS.filter(t => t.key === 'gpl' || t.key === 'upload')
      : [];

  const [activeTab, setActiveTab] = useState<Tab>(isDG ? 'overview' : 'gpl');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadSuccess = () => {
    setRefreshKey(k => k + 1);
  };

  // Non-GPL JWT users who somehow reach this page
  if (!isDG && userAgency !== 'gpl') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <ShieldAlert className="h-12 w-12 text-red-400" />
        <h2 className="text-xl font-semibold text-white">Access Denied</h2>
        <p className="text-[#64748b] max-w-md">
          Your account does not have permission to view this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 md:gap-4">
        {isDG && (
          <Link
            href="/intel"
            className="p-2.5 rounded-lg bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] transition-colors touch-active shrink-0"
          >
            <ArrowLeft className="h-5 w-5 text-[#94a3b8]" />
          </Link>
        )}
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="p-2 md:p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shrink-0">
            <ClipboardList className="text-white" size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold text-white truncate">Pending Applications</h1>
            <p className="text-[#64748b] text-xs md:text-sm truncate">
              {isDG ? 'New Service Connections — GPL & GWI' : 'GPL New Service Connections'}
            </p>
          </div>
        </div>
      </div>

      {/* Trend Charts (shown on overview tab when data exists) */}
      {activeTab === 'overview' && isDG && <TrendCharts refreshKey={refreshKey} />}

      {/* Tab Bar */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-[#1a2744] border border-[#2d3a52] overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        {allowedTabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 sm:py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex-1 sm:flex-none justify-center sm:justify-start ${
                active
                  ? 'bg-[#d4af37] text-[#0a1628]'
                  : 'text-[#94a3b8] hover:text-white hover:bg-[#2d3a52]/50'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && isDG && <OverviewTab refreshKey={refreshKey} />}
      {activeTab === 'gpl' && <GPLModule />}
      {activeTab === 'gwi' && isDG && <GWIAnalysisPanel />}
      {activeTab === 'upload' && (
        <UploadPanel
          onSuccess={handleUploadSuccess}
          lockedAgency={!isDG && userAgency === 'gpl' ? 'GPL' : undefined}
        />
      )}
    </div>
  );
}
