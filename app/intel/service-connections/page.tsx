'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Gauge, BarChart3, TrendingUp, List } from 'lucide-react';
import { EfficiencyTab } from '@/components/intel/service-connections/EfficiencyTab';
import { StageAnalysisTab } from '@/components/intel/service-connections/StageAnalysisTab';
import { MonthlyTrendsTab } from '@/components/intel/service-connections/MonthlyTrendsTab';
import { OrdersTab } from '@/components/intel/service-connections/OrdersTab';

type Tab = 'efficiency' | 'stages' | 'trends' | 'orders';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'efficiency', label: 'Efficiency', icon: Gauge },
  { key: 'stages', label: 'Stage Analysis', icon: BarChart3 },
  { key: 'trends', label: 'Monthly Trends', icon: TrendingUp },
  { key: 'orders', label: 'Orders', icon: List },
];

export default function ServiceConnectionsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('efficiency');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 md:gap-4">
        <Link
          href="/intel/gpl"
          className="p-2.5 rounded-lg bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-[#94a3b8]" />
        </Link>
        <div className="flex items-center gap-2 md:gap-3">
          <div className="p-2 md:p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg">
            <Gauge className="text-white" size={18} />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-white">Service Connection Efficiency</h1>
            <p className="text-[#64748b] text-xs md:text-sm">GPL new connection lifecycle tracking &amp; SLA compliance</p>
          </div>
        </div>
      </div>

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
      {activeTab === 'efficiency' && <EfficiencyTab />}
      {activeTab === 'stages' && <StageAnalysisTab />}
      {activeTab === 'trends' && <MonthlyTrendsTab />}
      {activeTab === 'orders' && <OrdersTab />}
    </div>
  );
}
