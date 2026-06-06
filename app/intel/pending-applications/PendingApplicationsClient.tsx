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
} from 'lucide-react';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
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
  isDG?: boolean;
  userAgency?: string | null;
  refreshKey?: number;
}

export default function PendingApplicationsClient(_props: Props) {
  const { effectiveUser } = useEffectiveUser();
  const isDG = (effectiveUser.role) === 'superadmin';
  const userAgency = effectiveUser.agency;

  // Tab visibility:
  //  Ministry roles see everything.
  //  GPL agency users see the GPL deep-dive and the Upload form locked to GPL.
  //  GWI agency users see the GWI deep-dive and the Upload form locked to GWI.
  //  Any other authorized user that reached this page (officer or
  //  agency_admin from another agency) gets a read-only Overview.
  const allowedTabs = isDG
    ? ALL_TABS
    : userAgency === 'GPL'
      ? ALL_TABS.filter(t => t.key === 'gpl' || t.key === 'upload')
      : userAgency === 'GWI'
        ? ALL_TABS.filter(t => t.key === 'gwi' || t.key === 'upload')
        : ALL_TABS.filter(t => t.key === 'overview');

  const defaultTab: Tab = isDG ? 'overview'
    : userAgency === 'GPL' ? 'gpl'
      : userAgency === 'GWI' ? 'gwi'
        : 'overview';

  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadSuccess = () => {
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 md:gap-4">
        {isDG && (
          <Link
            href="/intel"
            className="p-2.5 rounded-lg bg-navy-900 border border-navy-800 hover:border-gold-500 transition-colors touch-active shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-slate-400" />
          </Link>
        )}
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="p-2 md:p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shrink-0">
            <ClipboardList className="text-white" size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold text-white truncate">Pending Applications</h1>
            <p className="text-navy-600 text-xs md:text-sm truncate">
              {isDG ? 'New Service Connections — GPL & GWI' : 'GPL New Service Connections'}
            </p>
          </div>
        </div>
      </div>

      {/* Trend Charts (shown on overview tab when data exists) */}
      {activeTab === 'overview' && <TrendCharts refreshKey={refreshKey} />}

      {/* Tab Bar */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-navy-900 border border-navy-800 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        {allowedTabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 sm:py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex-1 sm:flex-none justify-center sm:justify-start ${
                active
                  ? 'bg-gold-500 text-navy-950'
                  : 'text-slate-400 hover:text-white hover:bg-navy-800/50'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab refreshKey={refreshKey} />}
      {activeTab === 'gpl' && <GPLModule />}
      {activeTab === 'gwi' && <GWIAnalysisPanel />}
      {activeTab === 'upload' && (
        <UploadPanel
          onSuccess={handleUploadSuccess}
          lockedAgency={
            !isDG && (userAgency === 'GPL' || userAgency === 'GWI')
              ? (userAgency as 'GPL' | 'GWI')
              : undefined
          }
        />
      )}
    </div>
  );
}
