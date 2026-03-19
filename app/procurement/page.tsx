'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShoppingCart, LayoutDashboard, BarChart3 } from 'lucide-react';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { ProcurementKanban } from '@/components/procurement/ProcurementKanban';
import { ProcurementAnalytics } from '@/components/procurement/ProcurementAnalytics';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

const tabs: Tab[] = [
  { id: 'pipeline', label: 'Pipeline', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export default function ProcurementPage() {
  const [activeTab, setActiveTab] = useState('pipeline');

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Page Header */}
      <div className="flex items-center flex-wrap gap-3 md:gap-4">
        <Link
          href="/"
          className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors touch-active"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gold-500/20 flex items-center justify-center">
            <ShoppingCart className="h-4 w-4 md:h-5 md:w-5 text-gold-500" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-white">Procurement Pipeline</h1>
            <p className="text-xs md:text-sm text-navy-600">Procurement tracking</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} compactOnMobile>
        <ErrorBoundary key={activeTab} fallbackTitle="Failed to load procurement board">
          {activeTab === 'pipeline' && <ProcurementKanban />}
          {activeTab === 'analytics' && <ProcurementAnalytics />}
        </ErrorBoundary>
      </Tabs>
    </div>
  );
}
