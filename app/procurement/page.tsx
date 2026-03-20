'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft, ShoppingCart, LayoutDashboard, BarChart3, Plus, Upload, Database, Trash2, Loader2 } from 'lucide-react';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { ProcurementKanban } from '@/components/procurement/ProcurementKanban';
import { ProcurementAnalytics } from '@/components/procurement/ProcurementAnalytics';
import { ProcurementNewPackageForm } from '@/components/procurement/ProcurementNewPackageForm';
import { BulkUploadModal } from '@/components/procurement/BulkUploadModal';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useToast } from '@/components/ui/Toast';

const tabs: Tab[] = [
  { id: 'pipeline', label: 'Pipeline', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export default function ProcurementPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('pipeline');
  const [showNewForm, setShowNewForm] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [demoLoading, setDemoLoading] = useState<'seed' | 'erase' | null>(null);

  const userRole = session?.user?.role;
  const canCreate = userRole === 'dg' || userRole === 'agency_admin';
  const isDG = userRole === 'dg';

  const handleDemoAction = async (action: 'seed' | 'erase') => {
    setDemoLoading(action);
    try {
      const res = await fetch('/api/procurement/demo', {
        method: action === 'seed' ? 'POST' : 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || `Failed to ${action} demo data`);
        return;
      }
      toast.success(data.message);
      setRefreshTrigger((t) => t + 1);
    } catch {
      toast.error('Network error');
    } finally {
      setDemoLoading(null);
    }
  };

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
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gold-500/20 flex items-center justify-center shrink-0">
            <ShoppingCart className="h-4 w-4 md:h-5 md:w-5 text-gold-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold text-white">Procurement Pipeline</h1>
            <p className="text-xs md:text-sm text-navy-600">Procurement tracking</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isDG && (
            <>
              <button
                onClick={() => handleDemoAction('seed')}
                disabled={!!demoLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-navy-800 text-navy-600 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors disabled:opacity-50"
              >
                {demoLoading === 'seed' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
                Seed Demo
              </button>
              <button
                onClick={() => handleDemoAction('erase')}
                disabled={!!demoLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-navy-800 text-navy-600 hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-50"
              >
                {demoLoading === 'erase' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Erase Demo
              </button>
            </>
          )}
          {canCreate && (
            <>
              <button
                onClick={() => setShowBulkUpload(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-navy-800 text-navy-600 hover:text-gold-500 hover:border-gold-500/30 transition-colors"
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Bulk Upload</span>
              </button>
              <button
                onClick={() => setShowNewForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-gold-500 text-navy-950 hover:bg-[#e5c348] transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Package
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} compactOnMobile>
        <ErrorBoundary key={activeTab} fallbackTitle="Failed to load procurement board">
          {activeTab === 'pipeline' && <ProcurementKanban refreshTrigger={refreshTrigger} />}
          {activeTab === 'analytics' && <ProcurementAnalytics />}
        </ErrorBoundary>
      </Tabs>

      {/* New package form */}
      <ProcurementNewPackageForm
        isOpen={showNewForm}
        onClose={() => setShowNewForm(false)}
        onCreated={() => setRefreshTrigger((t) => t + 1)}
      />

      {/* Bulk upload modal */}
      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onImported={() => setRefreshTrigger((t) => t + 1)}
      />
    </div>
  );
}
