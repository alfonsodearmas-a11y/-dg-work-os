'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AlertTriangle, Package, ChevronDown, LayoutGrid, List } from 'lucide-react';
import Link from 'next/link';
import { Award } from 'lucide-react';
import {
  TENDER_STAGES,
  KANBAN_STAGES,
  STAGE_CONFIG,
  type Tender,
  type TenderStage,
  type PipelineStats,
} from '@/lib/tender/types';
import { fmtDate } from '@/lib/format';
import { ProcurementCard } from './ProcurementCard';
import { ProcurementDetailPanel } from './ProcurementDetailPanel';
import { ProcurementListView } from './ProcurementListView';
import { useToast } from '@/components/ui/Toast';
import { useIsMobile } from '@/hooks/useIsMobile';
import { EmptyState } from '@/components/ui/EmptyState';
import { SELECTABLE_AGENCIES } from '@/lib/constants/agencies';
import { MINISTRY_ROLES } from '@/lib/people-types';
import { supabase } from '@/lib/db';
import type { Role } from '@/lib/auth';

const LS_VIEW_KEY = 'dg-procurement-view';
const BOARD_PAGE_SIZE = 10;
const INITIAL_COLUMN_PAGES = Object.fromEntries(KANBAN_STAGES.map((s) => [s, 1])) as Record<TenderStage, number>;

interface AwardedSincePayload {
  previous_upload_at: string | null;
  previous_upload_id: string | null;
  count: number;
  tenders: Tender[];
}

function canDragTender(
  role: Role | undefined,
  userId: string | undefined,
  userAgency: string | null | undefined,
  tender: Tender,
): boolean {
  if (role === 'dg') return true;
  if (role === 'agency_admin') {
    return tender.agency.toLowerCase() === (userAgency || '').toLowerCase();
  }
  // Officers can only drag manual tenders they created.
  if (role === 'officer') {
    return tender.source === 'manual' && tender.created_by === userId;
  }
  return false;
}

function sortTenders(tenders: Tender[]): Tender[] {
  return [...tenders].sort((a, b) => {
    const ad = a.days_at_current_stage ?? 0;
    const bd = b.days_at_current_stage ?? 0;
    const aUrgency = ad >= 30 ? 2 : ad >= 14 ? 1 : 0;
    const bUrgency = bd >= 30 ? 2 : bd >= 14 ? 1 : 0;
    if (bUrgency !== aUrgency) return bUrgency - aUrgency;
    return b.updated_at.localeCompare(a.updated_at);
  });
}

export function ProcurementKanban({
  refreshTrigger = 0,
  optimisticTender = null,
}: {
  refreshTrigger?: number;
  optimisticTender?: Tender | null;
}) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [tenders, setTenders] = useState<Tender[]>([]);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [awardedSince, setAwardedSince] = useState<AwardedSincePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Seed from `?agency=` so bento "View all" deep-links from /intel/[agency]
  // land on a pre-filtered board. Values are canonical uppercase per
  // migration 106. One-way: hydrate-on-mount; subsequent chip toggles update
  // local state only (URL stays static, matching how this component already
  // owns its own non-tender query state).
  const [agencyFilter, setAgencyFilter] = useState(() => searchParams.get('agency') ?? '');
  // URL is the source of truth — the detail drawer opens iff ?tender=<id> is present.
  const selectedTenderId = searchParams.get('tender');
  const setTenderParam = useCallback(
    (tenderId: string | null) => {
      const next = new URLSearchParams(Array.from(searchParams.entries()));
      if (tenderId) next.set('tender', tenderId);
      else next.delete('tender');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname],
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<TenderStage | null>('design');
  const [viewMode, setViewMode] = useState<'board' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(LS_VIEW_KEY) as 'board' | 'list') || 'board';
    }
    return 'board';
  });
  const [columnPages, setColumnPages] = useState(INITIAL_COLUMN_PAGES);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/procurement');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load tenders');
      }
      const data = await res.json();
      setTenders(data.tenders || []);
      setStats(data.stats || null);
      setAwardedSince(data.awarded_since || null);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch tenders:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tenders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [fetchData]);
  useEffect(() => { if (refreshTrigger > 0) fetchData(); }, [refreshTrigger, fetchData]);

  useEffect(() => {
    if (!optimisticTender) return;
    setTenders((prev) => (prev.some((t) => t.id === optimisticTender.id) ? prev : [optimisticTender, ...prev]));
  }, [optimisticTender]);

  useEffect(() => {
    const channel = supabase
      .channel('tender_kanban')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tender' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  useEffect(() => {
    const handleDragEnd = () => setDraggingId(null);
    document.addEventListener('dragend', handleDragEnd);
    return () => document.removeEventListener('dragend', handleDragEnd);
  }, []);

  useEffect(() => { localStorage.setItem(LS_VIEW_KEY, viewMode); }, [viewMode]);
  useEffect(() => { setColumnPages(INITIAL_COLUMN_PAGES); }, [agencyFilter, viewMode]);

  // Default board + list hide the Award stage. Awarded tenders live in
  // /procurement/archive. The agency filter still applies as before.
  const filtered = useMemo(() => {
    const activeOnly = tenders.filter((t) => t.stage !== 'award');
    if (!agencyFilter) return activeOnly;
    return activeOnly.filter((t) => t.agency.toUpperCase() === agencyFilter.toUpperCase());
  }, [tenders, agencyFilter]);

  const byStage = useMemo(() => {
    const grouped: Record<TenderStage, Tender[]> = {
      design: [], advertised: [], evaluation: [], awaiting_award: [], award: [],
    };
    for (const t of filtered) grouped[t.stage].push(t);
    for (const s of KANBAN_STAGES) grouped[s] = sortTenders(grouped[s]);
    return grouped;
  }, [filtered]);

  const visibleByStage = useMemo(() => {
    const result = {} as Record<TenderStage, Tender[]>;
    for (const s of KANBAN_STAGES) result[s] = byStage[s].slice(0, columnPages[s] * BOARD_PAGE_SIZE);
    return result;
  }, [byStage, columnPages]);

  const handleLoadMore = useCallback((s: TenderStage) => {
    setColumnPages((prev) => ({ ...prev, [s]: prev[s] + 1 }));
  }, []);

  const handleDragStart = useCallback((id: string) => setDraggingId(id), []);

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>, targetStage: TenderStage) => {
      e.preventDefault();
      const tenderId = e.dataTransfer.getData('text/plain');
      if (!tenderId) return;

      const t = tenders.find((x) => x.id === tenderId);
      if (!t) return;

      const userRole = session?.user?.role;
      const userAgency = session?.user?.agency;
      const userId = session?.user?.id;
      if (!canDragTender(userRole, userId, userAgency, t)) {
        toast.error("You can't advance this tender");
        return;
      }
      if (targetStage === t.stage) return;

      // Optimistic
      // Optimistic: the stage just changed so no PSIP date reflects the new stage yet; surface "—".
      setTenders((prev) => prev.map((x) => (x.id === tenderId ? { ...x, stage: targetStage, days_at_current_stage: null } : x)));

      try {
        const res = await fetch('/api/procurement/advance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenderId, newStage: targetStage }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || 'Failed to advance tender');
          fetchData();
          return;
        }
        const { tender: updated } = await res.json();
        if (updated) setTenders((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        toast.success(`Moved to ${STAGE_CONFIG[targetStage].label}`);
      } catch {
        toast.error('Network error');
        fetchData();
      }
    },
    [tenders, session, toast, fetchData],
  );

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex gap-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-navy-800 rounded-lg w-16" />)}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-navy-900 rounded-xl border border-navy-800" />)}
        </div>
        <div className={isMobile ? 'space-y-3' : 'flex gap-4 overflow-hidden'}>
          {Array.from({ length: isMobile ? 2 : 5 }).map((_, i) => (
            <div key={i} className={`${isMobile ? 'w-full' : 'min-w-[240px] flex-1'} bg-navy-900 rounded-xl border border-navy-800 p-4`}>
              <div className="h-5 bg-navy-800 rounded w-24 mb-4" />
              <div className="space-y-3">{Array.from({ length: 3 - (i % 2) }).map((_, j) => <div key={j} className="h-24 bg-navy-800/50 rounded-lg" />)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && tenders.length === 0) {
    return (
      <div className="bg-navy-900 rounded-xl border border-red-500/30 p-6 md:p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <h3 className="text-white text-lg font-semibold mb-2">Failed to Load Tenders</h3>
        <p className="text-navy-600 text-sm mb-4">{error}</p>
        <button onClick={() => { setLoading(true); setError(null); fetchData(); }} className="inline-flex items-center gap-2 px-5 py-2.5 bg-navy-800 hover:bg-navy-700 text-white rounded-lg text-sm font-medium transition-colors">Try Again</button>
      </div>
    );
  }

  if (tenders.length === 0) {
    return <EmptyState icon={<Package className="h-12 w-12" />} title="No tenders" description="Upload a PSIP Monitoring Form or create a tender manually." />;
  }

  const userRole = session?.user?.role;
  const userAgency = session?.user?.agency;
  const userId = session?.user?.id;
  const isMinistry = MINISTRY_ROLES.includes(userRole || '');
  const visibleAgencies = isMinistry
    ? SELECTABLE_AGENCIES
    : SELECTABLE_AGENCIES.filter((a) => a.toLowerCase() === (userAgency || '').toLowerCase());

  const showAwardBanner = !!awardedSince && awardedSince.count > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setAgencyFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${agencyFilter === '' ? 'bg-gold-500/20 text-gold-500 border-gold-500/30' : 'bg-navy-900 text-navy-600 border-navy-800 hover:text-white hover:border-navy-700'}`}>All</button>
          {visibleAgencies.map((a) => (
            <button
              key={a}
              onClick={() => setAgencyFilter(agencyFilter === a ? '' : a)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                agencyFilter === a ? 'bg-gold-500/20 text-gold-500 border-gold-500/30' : 'bg-navy-900 text-navy-600 border-navy-800 hover:text-white hover:border-navy-700'
              }`}
            >
              {a === 'HINTERLAND_AIRSTRIPS' ? 'Airstrips' : a}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {stats && (
            <div className="hidden md:flex items-center gap-3 text-xs font-medium text-navy-600">
              <span><span className="text-white font-semibold">{stats.total_active}</span> active</span>
              <span className="text-navy-800">·</span>
              <span><span className="text-white font-semibold">{stats.total_count}</span> total</span>
              <span className="text-navy-800">·</span>
              <span>
                <span className={`font-semibold ${stats.stalled_count > 0 ? 'text-red-400' : 'text-white'}`}>{stats.stalled_count}</span> stalled
              </span>
            </div>
          )}

          <div className="relative flex items-center rounded-lg border border-navy-800 bg-navy-950/50 p-0.5">
            <div
              className="absolute top-0.5 bottom-0.5 rounded-md bg-navy-800 transition-all duration-300 ease-out"
              style={{ width: 'calc(50% - 2px)', left: viewMode === 'board' ? '2px' : 'calc(50%)' }}
            />
            <button onClick={() => setViewMode('board')} className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 ${viewMode === 'board' ? 'text-gold-500' : 'text-navy-600 hover:text-slate-400'}`}>
              <LayoutGrid className="h-3.5 w-3.5" /><span className="hidden sm:inline">Board</span>
            </button>
            <button onClick={() => setViewMode('list')} className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 ${viewMode === 'list' ? 'text-gold-500' : 'text-navy-600 hover:text-slate-400'}`}>
              <List className="h-3.5 w-3.5" /><span className="hidden sm:inline">List</span>
            </button>
          </div>
        </div>
      </div>

      {showAwardBanner && awardedSince && (
        <Link
          href={`/procurement/archive?since=${encodeURIComponent(awardedSince.previous_upload_at || '')}`}
          className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-colors group"
        >
          <Award className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="text-white font-medium">
            <span className="text-emerald-400">{awardedSince.count}</span>{' '}
            {awardedSince.count === 1 ? 'tender' : 'tenders'} awarded since{' '}
            {awardedSince.previous_upload_at ? fmtDate(awardedSince.previous_upload_at) : 'the last upload'}
          </span>
          <span className="ml-auto text-navy-600 group-hover:text-emerald-300/80 transition-colors">View archive →</span>
        </Link>
      )}

      {stats && (
        <div className="grid grid-cols-3 gap-2 md:hidden">
          <div className="bg-navy-900 rounded-lg border border-navy-800 px-3 py-2"><div className="text-navy-600 text-[11px]">Active</div><div className="text-white text-sm font-bold">{stats.total_active}</div></div>
          <div className="bg-navy-900 rounded-lg border border-navy-800 px-3 py-2"><div className="text-navy-600 text-[11px]">Total</div><div className="text-white text-sm font-bold">{stats.total_count}</div></div>
          <div className="bg-navy-900 rounded-lg border border-navy-800 px-3 py-2"><div className="text-navy-600 text-[11px]">Stalled</div><div className={`text-sm font-bold ${stats.stalled_count > 0 ? 'text-red-400' : 'text-white'}`}>{stats.stalled_count}</div></div>
        </div>
      )}

      <div key={viewMode} style={{ animation: 'fadeIn 0.3s ease both' }}>
      {viewMode === 'list' ? (
        <ProcurementListView tenders={filtered} onSelect={setTenderParam} />
      ) : isMobile ? (
        <div className="space-y-2">
          {KANBAN_STAGES.map((stage) => {
            const config = STAGE_CONFIG[stage];
            const all = byStage[stage];
            const visible = visibleByStage[stage];
            const isExpanded = mobileTab === stage;
            const hasMore = visible.length < all.length;
            return (
              <div key={stage}>
                <button
                  onClick={() => setMobileTab(isExpanded ? null : stage)}
                  className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-navy-900/70 border border-navy-800 transition-colors"
                  style={{ minHeight: 48 }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: config.color }} />
                    <span className="text-sm font-semibold text-white">{config.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${config.color}33`, color: config.color }}>{all.length}</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-navy-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isExpanded && (
                  <div className="space-y-2 pt-2">
                    {all.length === 0 ? (
                      <div className="flex items-center justify-center h-16 text-navy-600 text-sm">No tenders</div>
                    ) : (
                      <>
                        {visible.map((t) => (
                          <ProcurementCard key={t.id} tender={t} onClick={() => setTenderParam(t.id)} canDrag={false} isMobile />
                        ))}
                        {hasMore && (
                          <button onClick={() => handleLoadMore(stage)} className="w-full py-2.5 text-xs font-medium text-navy-600 hover:text-gold-500 transition-colors rounded-lg hover:bg-navy-900/50">
                            Show more · {all.length - visible.length} remaining
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
        <div className="flex gap-4 overflow-x-auto pb-4">
          {KANBAN_STAGES.map((stage) => (
            <div key={stage} className="flex-1 min-w-[240px] max-w-[280px]">
              <ProcurementColumn
                stage={stage}
                tenders={visibleByStage[stage]}
                totalCount={byStage[stage].length}
                hasMore={visibleByStage[stage].length < byStage[stage].length}
                onLoadMore={() => handleLoadMore(stage)}
                draggingId={draggingId}
                userRole={userRole}
                userAgency={userAgency}
                userId={userId}
                onDrop={handleDrop}
                onCardClick={setTenderParam}
                onDragStart={handleDragStart}
              />
            </div>
          ))}
        </div>
      )}
      </div>

      <ProcurementDetailPanel
        tenderId={selectedTenderId}
        isOpen={!!selectedTenderId}
        onClose={() => setTenderParam(null)}
        onDeleted={() => { setTenderParam(null); fetchData(); }}
      />
    </div>
  );
}

interface ProcurementColumnProps {
  stage: TenderStage;
  tenders: Tender[];
  totalCount: number;
  hasMore: boolean;
  onLoadMore: () => void;
  draggingId: string | null;
  userRole: Role | undefined;
  userAgency: string | null | undefined;
  userId: string | undefined;
  onDrop: (e: React.DragEvent<HTMLDivElement>, stage: TenderStage) => void;
  onCardClick: (id: string) => void;
  onDragStart: (id: string) => void;
}

function ProcurementColumn({ stage, tenders, totalCount, hasMore, onLoadMore, draggingId, userRole, userAgency, userId, onDrop, onCardClick, onDragStart }: ProcurementColumnProps) {
  const [isOver, setIsOver] = useState(false);
  const config = STAGE_CONFIG[stage];

  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
          <h3 className="text-white font-semibold text-sm">{config.label}</h3>
        </div>
        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${config.color}33`, color: config.color }}>{totalCount}</span>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsOver(true); }}
        onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget as Node)) return; setIsOver(false); }}
        onDrop={(e) => { e.preventDefault(); setIsOver(false); onDrop(e, stage); }}
        className={`space-y-2 p-2 rounded-xl min-h-[200px] transition-colors duration-200 ${
          isOver ? 'bg-gold-500/10 border-2 border-dashed border-gold-500/50' : 'bg-navy-950/50 border-2 border-transparent'
        }`}
      >
        {tenders.map((t) => {
          const cardDraggable = canDragTender(userRole, userId, userAgency, t);
          return (
            <ProcurementCard
              key={t.id}
              tender={t}
              onClick={() => onCardClick(t.id)}
              isDragging={draggingId === t.id}
              canDrag={cardDraggable}
              onDragStarted={() => onDragStart(t.id)}
            />
          );
        })}
        {tenders.length === 0 && (
          <div className="flex items-center justify-center h-24 text-navy-600 text-sm">No tenders</div>
        )}
        {hasMore && (
          <button onClick={onLoadMore} className="w-full mt-1 py-2 text-xs font-medium text-navy-600 hover:text-gold-500 transition-colors rounded-lg hover:bg-navy-900/50">
            Show more · {totalCount - tenders.length} remaining
          </button>
        )}
      </div>
    </div>
  );
}
