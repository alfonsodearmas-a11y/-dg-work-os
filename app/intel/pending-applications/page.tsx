'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ClipboardList,
  LayoutDashboard,
  Zap,
  Droplets,
  Upload,
  Gauge,
} from 'lucide-react';
import { OverviewTab } from '@/components/intel/pending-applications/OverviewTab';
import { GPLAnalysisPanel } from '@/components/intel/pending-applications/GPLAnalysisPanel';
import { GWIAnalysisPanel } from '@/components/intel/pending-applications/GWIAnalysisPanel';
import { UploadPanel } from '@/components/intel/pending-applications/UploadPanel';
import { TrendCharts } from '@/components/intel/pending-applications/TrendCharts';
import { EfficiencyPanel } from '@/components/intel/pending-applications/EfficiencyPanel';

type Tab = 'overview' | 'gpl' | 'gwi' | 'efficiency' | 'upload';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'gpl', label: 'GPL Analysis', icon: Zap },
  { key: 'gwi', label: 'GWI Analysis', icon: Droplets },
  { key: 'efficiency', label: 'Efficiency', icon: Gauge },
  { key: 'upload', label: 'Upload', icon: Upload },
];

export default function PendingApplicationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadSuccess = () => {
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 md:gap-4">
        <Link
          href="/intel"
          className="p-2.5 rounded-lg bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] transition-colors touch-active shrink-0"
        >
          <ArrowLeft className="h-5 w-5 text-[#94a3b8]" />
        </Link>
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="p-2 md:p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shrink-0">
            <ClipboardList className="text-white" size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold text-white truncate">Pending Applications</h1>
            <p className="text-[#64748b] text-xs md:text-sm truncate">New Service Connections — GPL &amp; GWI</p>
          </div>
        </div>
      </div>

      {/* Trend Charts (shown on overview tab when data exists) */}
      {activeTab === 'overview' && <TrendCharts refreshKey={refreshKey} />}

      {/* Tab Bar */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-[#1a2744] border border-[#2d3a52] overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
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
      {activeTab === 'overview' && <OverviewTab refreshKey={refreshKey} />}
      {activeTab === 'gpl' && <GPLAnalysisPanel />}
      {activeTab === 'gwi' && <GWIAnalysisPanel />}
      {activeTab === 'efficiency' && <EfficiencyPanel />}
      {activeTab === 'upload' && <UploadPanel onSuccess={handleUploadSuccess} />}
    </div>
  );
}
