'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { RefreshCw, AlertTriangle, Package } from 'lucide-react';
import {
  PROCUREMENT_STAGES,
  STAGE_CONFIG,
  ProcurementPackage,
  ProcurementStage,
  PipelineStats,
} from '@/lib/procurement-types';
import { ProcurementCard } from './ProcurementCard';
import { ProcurementDetailPanel } from './ProcurementDetailPanel';
import { fmtCurrency } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';
import { useIsMobile } from '@/hooks/useIsMobile';
import { EmptyState } from '@/components/ui/EmptyState';
import { SELECTABLE_AGENCIES } from '@/lib/constants/agencies';
import type { Role } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function canDrag(role: Role | undefined): boolean {
  return role === 'agency_admin' || role === 'dg';
}

function sortPackages(packages: ProcurementPackage[]): ProcurementPackage[] {
  return [...packages].sort((a, b) => {
    // Stalled first (days >= 30 red, >= 14 amber, rest green) — red first, then amber, then green
    const aUrgency = a.days_at_current_stage >= 30 ? 2 : a.days_at_current_stage >= 14 ? 1 : 0;
    const bUrgency = b.days_at_current_stage >= 30 ? 2 : b.days_at_current_stage >= 14 ? 1 : 0;
    if (bUrgency !== aUrgency) return bUrgency - aUrgency;
    // Then by estimated_value desc
    return b.estimated_value - a.estimated_value;
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProcurementKanban({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // State
  const [packages, setPackages] = useState<ProcurementPackage[]>([]);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agencyFilter, setAgencyFilter] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<ProcurementStage>('draft');

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/procurement');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load procurement data');
      }
      const data = await res.json();
      setPackages(data.packages || []);
      setStats(data.stats || null);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch procurement data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load procurement data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 60-second polling
  useEffect(() => {
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Refetch when parent triggers a refresh (e.g. after new package creation)
  useEffect(() => {
    if (refreshTrigger > 0) fetchData();
  }, [refreshTrigger, fetchData]);

  // Global dragend cleanup
  useEffect(() => {
    const handleDragEnd = () => setDraggingId(null);
    document.addEventListener('dragend', handleDragEnd);
    return () => document.removeEventListener('dragend', handleDragEnd);
  }, []);

  // ---------------------------------------------------------------------------
  // Filtered + grouped packages
  // ---------------------------------------------------------------------------

  const filteredPackages = useMemo(() => {
    if (!agencyFilter) return packages;
    return packages.filter(
      (p) => p.agency.toUpperCase() === agencyFilter.toUpperCase()
    );
  }, [packages, agencyFilter]);

  const packagesByStage = useMemo(() => {
    const grouped: Record<ProcurementStage, ProcurementPackage[]> = {
      draft: [],
      submitted: [],
      advertised: [],
      evaluation: [],
      no_objection: [],
      awarded: [],
    };
    for (const pkg of filteredPackages) {
      grouped[pkg.current_stage].push(pkg);
    }
    // Sort each column
    for (const stage of PROCUREMENT_STAGES) {
      grouped[stage] = sortPackages(grouped[stage]);
    }
    return grouped;
  }, [filteredPackages]);

  // ---------------------------------------------------------------------------
  // Drag and drop
  // ---------------------------------------------------------------------------

  const handleDragStart = useCallback((packageId: string) => {
    setDraggingId(packageId);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>, targetStage: ProcurementStage) => {
      e.preventDefault();
      const packageId = e.dataTransfer.getData('text/plain');
      if (!packageId) return;

      const pkg = packages.find((p) => p.id === packageId);
      if (!pkg) return;

      const userRole = session?.user?.role;
      const userAgency = session?.user?.agency;

      // Rule: only agency_admin or DG can advance
      if (!canDrag(userRole)) {
        toast.error('Only agency admins can advance packages');
        return;
      }

      // Rule: package must belong to user's agency (DG can advance any)
      if (userRole !== 'dg' && pkg.agency.toLowerCase() !== userAgency?.toLowerCase()) {
        toast.error('Cannot advance packages from another agency');
        return;
      }

      const currentIdx = PROCUREMENT_STAGES.indexOf(pkg.current_stage);
      const targetIdx = PROCUREMENT_STAGES.indexOf(targetStage);

      // Rule: forward-only
      if (targetIdx <= currentIdx) {
        toast.error('Can only advance to a later stage');
        return;
      }

      // Rule: exactly one stage forward
      if (targetIdx !== currentIdx + 1) {
        toast.error('Cannot skip stages');
        return;
      }

      // Optimistic update
      setPackages((prev) =>
        prev.map((p) =>
          p.id === packageId ? { ...p, current_stage: targetStage, days_at_current_stage: 0 } : p
        )
      );

      try {
        const res = await fetch('/api/procurement/advance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packageId, newStage: targetStage }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || 'Failed to advance package');
          // Revert optimistic update
          fetchData();
          return;
        }

        const { package: updated } = await res.json();
        if (updated) {
          setPackages((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p))
          );
        }

        const stageLabel = STAGE_CONFIG[targetStage].label;
        toast.success(`Package advanced to ${stageLabel}`);
      } catch {
        toast.error('Network error');
        fetchData();
      }
    },
    [packages, session, toast, fetchData]
  );

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-navy-800 rounded-lg w-16" />
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-navy-900 rounded-xl border border-navy-800" />
          ))}
        </div>
        <div className={isMobile ? 'space-y-3' : 'flex gap-4 overflow-hidden'}>
          {Array.from({ length: isMobile ? 2 : 5 }).map((_, i) => (
            <div
              key={i}
              className={`${isMobile ? 'w-full' : 'min-w-[240px] flex-1'} bg-navy-900 rounded-xl border border-navy-800 p-4`}
            >
              <div className="h-5 bg-navy-800 rounded w-24 mb-4" />
              <div className="space-y-3">
                {Array.from({ length: 3 - (i % 2) }).map((_, j) => (
                  <div key={j} className="h-24 bg-navy-800/50 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (error && packages.length === 0) {
    return (
      <div className="bg-navy-900 rounded-xl border border-red-500/30 p-6 md:p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <h3 className="text-white text-lg font-semibold mb-2">Failed to Load Procurement Data</h3>
        <p className="text-navy-600 text-sm mb-4">{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            fetchData();
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-navy-800 hover:bg-navy-700 text-white rounded-lg text-sm font-medium transition-colors"
          style={{ minHeight: 44, touchAction: 'manipulation' }}
        >
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  if (packages.length === 0) {
    return (
      <EmptyState
        icon={<Package className="h-12 w-12" />}
        title="No procurement packages"
        description="No procurement packages have been submitted yet."
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const userRole = session?.user?.role;
  const userAgency = session?.user?.agency;
  const isDraggable = canDrag(userRole);

  return (
    <div className="space-y-4">
      {/* Header: filter chips + new package button */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setAgencyFilter('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              agencyFilter === ''
                ? 'bg-gold-500/20 text-gold-500 border-gold-500/30'
                : 'bg-navy-900 text-navy-600 border-navy-800 hover:text-white hover:border-navy-700'
            }`}
          >
            All
          </button>
          {SELECTABLE_AGENCIES.map((agency) => (
            <button
              key={agency}
              onClick={() => setAgencyFilter(agencyFilter === agency ? '' : agency)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                agencyFilter === agency
                  ? 'bg-gold-500/20 text-gold-500 border-gold-500/30'
                  : 'bg-navy-900 text-navy-600 border-navy-800 hover:text-white hover:border-navy-700'
              }`}
            >
              {agency}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-navy-900 rounded-xl border border-navy-800 p-3">
            <div className="text-navy-600 text-xs mb-1">Active Packages</div>
            <div className="text-white text-lg font-bold">{stats.total_active}</div>
          </div>
          <div className="bg-navy-900 rounded-xl border border-navy-800 p-3">
            <div className="text-navy-600 text-xs mb-1">Pipeline Value</div>
            <div className="text-white text-lg font-bold">{fmtCurrency(stats.total_value)}</div>
          </div>
          <div className="bg-navy-900 rounded-xl border border-navy-800 p-3">
            <div className="text-navy-600 text-xs mb-1">Avg Days to Award</div>
            <div className="text-white text-lg font-bold">{stats.avg_days_to_award || '-'}</div>
          </div>
          <div className="bg-navy-900 rounded-xl border border-navy-800 p-3">
            <div className="text-navy-600 text-xs mb-1">Stalled</div>
            <div className={`text-lg font-bold ${stats.stalled_count > 0 ? 'text-red-400' : 'text-white'}`}>
              {stats.stalled_count}
            </div>
          </div>
        </div>
      )}

      {/* Kanban board */}
      {isMobile ? (
        <>
          {/* Mobile: Tab bar */}
          <div className="flex overflow-x-auto gap-1 -mx-1 px-1 pb-1 scrollbar-none">
            {PROCUREMENT_STAGES.map((stage) => {
              const isActive = mobileTab === stage;
              const config = STAGE_CONFIG[stage];
              const count = packagesByStage[stage].length;
              return (
                <button
                  key={stage}
                  onClick={() => setMobileTab(stage)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'bg-navy-900'
                      : 'border-transparent text-navy-600'
                  }`}
                  style={{
                    borderBottomColor: isActive ? config.color : 'transparent',
                    color: isActive ? config.color : undefined,
                    minHeight: 44,
                    touchAction: 'manipulation',
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: config.color }}
                    aria-hidden="true"
                  />
                  {config.label}
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-white/10' : 'bg-navy-800'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Mobile: Single column */}
          <ProcurementColumn
            stage={mobileTab}
            packages={packagesByStage[mobileTab]}
            isMobile={true}
            draggingId={null}
            isDraggable={false}
            userRole={userRole}
            userAgency={userAgency}
            onDrop={() => {}}
            onCardClick={setSelectedPackageId}
            onDragStart={handleDragStart}
          />
        </>
      ) : (
        /* Desktop: Multi-column */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PROCUREMENT_STAGES.map((stage) => (
            <div key={stage} className="flex-1 min-w-[240px] max-w-[280px]">
              <ProcurementColumn
                stage={stage}
                packages={packagesByStage[stage]}
                isMobile={false}
                draggingId={draggingId}
                isDraggable={isDraggable}
                userRole={userRole}
                userAgency={userAgency}
                onDrop={handleDrop}
                onCardClick={setSelectedPackageId}
                onDragStart={handleDragStart}
              />
            </div>
          ))}
        </div>
      )}

      {/* Detail panel */}
      <ProcurementDetailPanel
        packageId={selectedPackageId}
        isOpen={!!selectedPackageId}
        onClose={() => setSelectedPackageId(null)}
      />

    </div>
  );
}

// ---------------------------------------------------------------------------
// Column sub-component
// ---------------------------------------------------------------------------

interface ProcurementColumnProps {
  stage: ProcurementStage;
  packages: ProcurementPackage[];
  isMobile: boolean;
  draggingId: string | null;
  isDraggable: boolean;
  userRole: Role | undefined;
  userAgency: string | null | undefined;
  onDrop: (e: React.DragEvent<HTMLDivElement>, stage: ProcurementStage) => void;
  onCardClick: (id: string) => void;
  onDragStart: (id: string) => void;
}

function ProcurementColumn({
  stage,
  packages: pkgs,
  isMobile,
  draggingId,
  isDraggable,
  userRole,
  userAgency,
  onDrop,
  onCardClick,
  onDragStart,
}: ProcurementColumnProps) {
  const [isOver, setIsOver] = useState(false);
  const config = STAGE_CONFIG[stage];

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(false);
    onDrop(e, stage);
  };

  return (
    <div className={isMobile ? 'w-full' : ''}>
      {/* Column Header (hidden on mobile -- tab bar handles it) */}
      {!isMobile && (
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: config.color }}
            />
            <h3 className="text-white font-semibold text-sm">{config.label}</h3>
          </div>
          <span
            className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: `${config.color}33`,
              color: config.color,
            }}
          >
            {pkgs.length}
          </span>
        </div>
      )}

      {/* Drop zone */}
      <div
        {...(!isMobile
          ? {
              onDragOver: handleDragOver,
              onDragLeave: handleDragLeave,
              onDrop: handleDrop,
            }
          : {})}
        className={`space-y-2 p-2 rounded-xl min-h-[200px] transition-colors duration-200 ${
          isOver
            ? 'bg-gold-500/10 border-2 border-dashed border-gold-500/50'
            : isMobile
              ? ''
              : 'bg-navy-950/50 border-2 border-transparent'
        }`}
      >
        {pkgs.map((pkg) => {
          const cardDraggable =
            isDraggable && !isMobile && (userRole === 'dg' || pkg.agency.toLowerCase() === userAgency?.toLowerCase());

          return (
            <ProcurementCard
              key={pkg.id}
              pkg={pkg}
              onClick={() => onCardClick(pkg.id)}
              isDragging={draggingId === pkg.id}
              canDrag={cardDraggable}
              onDragStarted={() => onDragStart(pkg.id)}
            />
          );
        })}

        {pkgs.length === 0 && (
          <div className="flex items-center justify-center h-24 text-navy-600 text-sm">
            No packages
          </div>
        )}
      </div>
    </div>
  );
}
