'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft, ShoppingCart, LayoutDashboard, BarChart3, Plus, Upload,
  Inbox, TrendingUp, EyeOff, Award,
} from 'lucide-react';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { MenuButton, type MenuItem } from '@/components/ui/MenuButton';
import { ProcurementKanban } from '@/components/procurement/ProcurementKanban';
import { ProcurementAnalytics } from '@/components/procurement/ProcurementAnalytics';
import { ProcurementNewPackageForm } from '@/components/procurement/ProcurementNewPackageForm';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import type { Tender } from '@/lib/tender/types';

const tabs: Tab[] = [
  { id: 'pipeline', label: 'Pipeline', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

const OVERFLOW_ITEMS: MenuItem[] = [
  { label: 'Archive', href: '/procurement/archive', icon: Award },
  { label: 'What Moved', href: '/procurement/changes', icon: TrendingUp },
  { label: 'Review', href: '/procurement/review', icon: Inbox },
  { label: 'Missing', href: '/procurement/missing', icon: EyeOff },
];

export default function ProcurementPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState('pipeline');
  const [showNewForm, setShowNewForm] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [optimisticTender, setOptimisticTender] = useState<Tender | null>(null);

  const userRole = session?.user?.role;
  const canCreate = userRole === 'dg' || userRole === 'minister' || userRole === 'ps' || userRole === 'agency_admin' || userRole === 'officer';
  const canUpload = userRole === 'dg' || userRole === 'minister' || userRole === 'ps';

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-3 md:gap-4">
        <Link href="/" className="shrink-0 p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors touch-active" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gold-500/20 flex items-center justify-center shrink-0">
            <ShoppingCart className="h-4 w-4 md:h-5 md:w-5 text-gold-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold text-white">Procurement Pipeline</h1>
            <p className="text-xs md:text-sm text-navy-600 truncate">Tender tracking · weekly PSIP ingestion</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canUpload && (
            <Link
              href="/procurement/uploads"
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium border border-navy-800 text-navy-600 hover:text-gold-500 hover:border-gold-500/30 transition-colors"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Upload PSIP</span>
            </Link>
          )}
          {canCreate && (
            <button
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-semibold bg-gold-500 text-navy-950 hover:bg-[#e5c348] transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Tender</span>
            </button>
          )}
          <MenuButton items={OVERFLOW_ITEMS} ariaLabel="More procurement views" />
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} compactOnMobile>
        <ErrorBoundary key={activeTab} fallbackTitle="Failed to load procurement board">
          {activeTab === 'pipeline' && (
            <ProcurementKanban refreshTrigger={refreshTrigger} optimisticTender={optimisticTender} />
          )}
          {activeTab === 'analytics' && <ProcurementAnalytics />}
        </ErrorBoundary>
      </Tabs>

      <ProcurementNewPackageForm
        isOpen={showNewForm}
        onClose={() => setShowNewForm(false)}
        onCreated={(tender) => {
          setOptimisticTender(tender);
          setRefreshTrigger((t) => t + 1);
        }}
      />
    </div>
  );
}
