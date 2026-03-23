'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { RefreshCw, AlertTriangle, Package, ChevronDown, LayoutGrid, List, Settings } from 'lucide-react';
import {
  PROCUREMENT_STAGES,
  STAGE_CONFIG,
  ProcurementPackage,
  ProcurementStage,
  PipelineStats,
} from '@/lib/procurement-types';
import { ProcurementCard } from './ProcurementCard';
import { ProcurementDetailPanel } from './ProcurementDetailPanel';
import { ProcurementListView } from './ProcurementListView';
import { useToast } from '@/components/ui/Toast';
import { useIsMobile } from '@/hooks/useIsMobile';
import { EmptyState } from '@/components/ui/EmptyState';
import { SELECTABLE_AGENCIES } from '@/lib/constants/agencies';
import { supabase } from '@/lib/db';
import type { Role } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const LS_VIEW_KEY = 'dg-procurement-view';
const BOARD_PAGE_SIZE = 10;

const INITIAL_COLUMN_PAGES = Object.fromEntries(
  PROCUREMENT_STAGES.map(s => [s, 1]),
) as Record<ProcurementStage, number>;

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
  const [trelloLastSyncedAt, setTrelloLastSyncedAt] = useState<string | null>(null);
  const [trelloSyncing, setTrelloSyncing] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<ProcurementStage | null>('pre_advertisement');
  const [viewMode, setViewMode] = useState<'board' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(LS_VIEW_KEY) as 'board' | 'list') || 'board';
    }
    return 'board';
  });
  const [columnPages, setColumnPages] = useState(INITIAL_COLUMN_PAGES);

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
      setTrelloLastSyncedAt(data.trello_last_synced_at || null);
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

  // Supabase realtime: refetch when Trello-synced items change
  useEffect(() => {
    const channel = supabase
      .channel('procurement_items_kanban')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'procurement_items' }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // Global dragend cleanup
  useEffect(() => {
    const handleDragEnd = () => setDraggingId(null);
    document.addEventListener('dragend', handleDragEnd);
    return () => document.removeEventListener('dragend', handleDragEnd);
  }, []);

  // Persist view preference
  useEffect(() => {
    localStorage.setItem(LS_VIEW_KEY, viewMode);
  }, [viewMode]);

  // Reset column pagination when filter or view mode changes
  useEffect(() => {
    setColumnPages(INITIAL_COLUMN_PAGES);
  }, [agencyFilter, viewMode]);

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
      pre_advertisement: [],
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

  // Per-column visible slices for board pagination
  const visibleByStage = useMemo(() => {
    const result = {} as Record<ProcurementStage, ProcurementPackage[]>;
    for (const stage of PROCUREMENT_STAGES) {
      const all = packagesByStage[stage];
      result[stage] = all.slice(0, columnPages[stage] * BOARD_PAGE_SIZE);
    }
    return result;
  }, [packagesByStage, columnPages]);

  const handleLoadMore = useCallback((stage: ProcurementStage) => {
    setColumnPages(prev => ({ ...prev, [stage]: prev[stage] + 1 }));
  }, []);

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
        toast.error('Only agency admins can advance tenders');
        return;
      }

      // Rule: package must belong to user's agency (DG can advance any)
      if (userRole !== 'dg' && pkg.agency.toLowerCase() !== userAgency?.toLowerCase()) {
        toast.error('Cannot advance tenders from another agency');
        return;
      }

      // Prevent no-op (same stage)
      if (targetStage === pkg.current_stage) return;

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
          toast.error(err.error || 'Failed to advance tender');
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
        toast.success(`Tender advanced to ${stageLabel}`);
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
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
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
        title="No procurement tenders"
        description="No procurement tenders have been submitted yet."
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

        {/* View toggle */}
        <div className="relative flex items-center rounded-lg border border-navy-800 bg-navy-950/50 p-0.5">
          <div
            className="absolute top-0.5 bottom-0.5 rounded-md bg-navy-800 transition-all duration-300 ease-out"
            style={{
              width: 'calc(50% - 2px)',
              left: viewMode === 'board' ? '2px' : 'calc(50%)',
            }}
          />
          <button
            onClick={() => setViewMode('board')}
            className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 ${
              viewMode === 'board' ? 'text-gold-500' : 'text-navy-600 hover:text-slate-400'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Board</span>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 ${
              viewMode === 'list' ? 'text-gold-500' : 'text-navy-600 hover:text-slate-400'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">List</span>
          </button>
        </div>

        {/* Sync settings gear (hidden behind icon) */}
        {trelloLastSyncedAt && (
          <SyncDropdown
            lastSyncedAt={trelloLastSyncedAt}
            syncing={trelloSyncing}
            onSync={async () => {
              setTrelloSyncing(true);
              try {
                await fetch('/api/integrations/trello/sync', { method: 'POST' });
                await fetchData();
              } finally {
                setTrelloSyncing(false);
              }
            }}
          />
        )}
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-navy-900 rounded-xl border border-navy-800 p-3">
            <div className="text-navy-600 text-xs mb-1">Active Tenders</div>
            <div className="text-white text-lg font-bold">{stats.total_active}</div>
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

      {/* Board / List view */}
      <div key={viewMode} style={{ animation: 'fadeIn 0.3s ease both' }}>
      {viewMode === 'list' ? (
        <ProcurementListView packages={filteredPackages} onSelect={setSelectedPackageId} onBulkAction={fetchData} />
      ) : isMobile ? (
        /* Mobile: Collapsible stage sections */
        <div className="space-y-2">
          {PROCUREMENT_STAGES.map((stage) => {
            const config = STAGE_CONFIG[stage];
            const pkgs = packagesByStage[stage];
            const visiblePkgs = visibleByStage[stage];
            const isExpanded = mobileTab === stage;
            const stageHasMore = visiblePkgs.length < pkgs.length;
            return (
              <div key={stage}>
                <button
                  onClick={() => setMobileTab(isExpanded ? null : stage)}
                  className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-navy-900/70 border border-navy-800 transition-colors"
                  style={{ minHeight: 48, touchAction: 'manipulation' }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: config.color }}
                    />
                    <span className="text-sm font-semibold text-white">{config.label}</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: `${config.color}33`,
                        color: config.color,
                      }}
                    >
                      {pkgs.length}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-navy-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {isExpanded && (
                  <div className="space-y-2 pt-2">
                    {pkgs.length === 0 ? (
                      <div className="flex items-center justify-center h-16 text-navy-600 text-sm">
                        No tenders
                      </div>
                    ) : (
                      <>
                        {visiblePkgs.map((pkg) => (
                          <ProcurementCard
                            key={pkg.id}
                            pkg={pkg}
                            onClick={() => setSelectedPackageId(pkg.id)}
                            canDrag={false}
                            isMobile
                          />
                        ))}
                        {stageHasMore && (
                          <button
                            onClick={() => handleLoadMore(stage)}
                            className="w-full py-2.5 text-xs font-medium text-navy-600 hover:text-gold-500 transition-colors rounded-lg hover:bg-navy-900/50"
                            style={{ minHeight: 44, touchAction: 'manipulation' }}
                          >
                            Show more · {pkgs.length - visiblePkgs.length} remaining
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop: Multi-column */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PROCUREMENT_STAGES.map((stage) => (
            <div key={stage} className="flex-1 min-w-[240px] max-w-[280px]">
              <ProcurementColumn
                stage={stage}
                packages={visibleByStage[stage]}
                totalCount={packagesByStage[stage].length}
                hasMore={visibleByStage[stage].length < packagesByStage[stage].length}
                onLoadMore={() => handleLoadMore(stage)}
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
      </div>

      {/* Detail panel */}
      <ProcurementDetailPanel
        packageId={selectedPackageId}
        isOpen={!!selectedPackageId}
        onClose={() => setSelectedPackageId(null)}
        onDeleted={() => {
          setSelectedPackageId(null);
          fetchData();
        }}
      />

    </div>
  );
}

// ---------------------------------------------------------------------------
// Sync dropdown (gear icon)
// ---------------------------------------------------------------------------

function SyncDropdown({
  lastSyncedAt,
  syncing,
  onSync,
}: {
  lastSyncedAt: string;
  syncing: boolean;
  onSync: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded-lg text-navy-600 hover:text-white hover:bg-navy-800/50 transition-colors"
        aria-label="Sync settings"
      >
        <Settings className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-xl border border-navy-800 bg-navy-900 shadow-xl p-4 space-y-3">
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Data Sources</h4>
          <div className="space-y-1.5">
            <p className="text-sm text-white font-medium">HECI Capital Projects</p>
            <p className="text-xs text-navy-600">Last synced: {relativeTime(lastSyncedAt)}</p>
          </div>
          <button
            onClick={() => { onSync(); setOpen(false); }}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-navy-800 text-navy-600 hover:text-gold-500 hover:border-gold-500/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column sub-component
// ---------------------------------------------------------------------------

interface ProcurementColumnProps {
  stage: ProcurementStage;
  packages: ProcurementPackage[];
  totalCount: number;
  hasMore: boolean;
  onLoadMore: () => void;
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
  totalCount,
  hasMore,
  onLoadMore,
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
    <div>
      {/* Column Header */}
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
          {totalCount}
        </span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`space-y-2 p-2 rounded-xl min-h-[200px] transition-colors duration-200 ${
          isOver
            ? 'bg-gold-500/10 border-2 border-dashed border-gold-500/50'
            : 'bg-navy-950/50 border-2 border-transparent'
        }`}
      >
        {pkgs.map((pkg) => {
          const cardDraggable =
            isDraggable && (userRole === 'dg' || pkg.agency.toLowerCase() === userAgency?.toLowerCase());

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
            No tenders
          </div>
        )}

        {hasMore && (
          <button
            onClick={onLoadMore}
            className="w-full mt-1 py-2 text-xs font-medium text-navy-600 hover:text-gold-500 transition-colors rounded-lg hover:bg-navy-900/50"
          >
            Show more · {totalCount - pkgs.length} remaining
          </button>
        )}
      </div>
    </div>
  );
}
