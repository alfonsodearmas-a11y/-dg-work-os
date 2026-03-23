'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ClipboardCheck,
  RefreshCw,
  ExternalLink,
  Paperclip,
  MessageSquare,
  Calendar,
  Filter,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/db';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ProcurementStage } from '@/lib/trello';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProcurementItem {
  id: string;
  board_id: string;
  trello_card_id: string;
  title: string;
  description: string | null;
  stage: ProcurementStage;
  trello_list_id: string;
  due_date: string | null;
  labels: { id: string; name: string; color: string | null }[];
  attachments_count: number;
  comments_count: number;
  trello_url: string | null;
  last_activity_at: string | null;
  board?: { agency: string; board_name: string; last_synced_at: string | null };
}

interface BoardInfo {
  id: string;
  agency: string;
  board_name: string;
  trello_board_id: string;
  last_synced_at: string | null;
}

// ---------------------------------------------------------------------------
// Stage config
// ---------------------------------------------------------------------------

const STAGES: { key: ProcurementStage; label: string; color: string; dotColor: string }[] = [
  { key: 'not_advertised', label: 'Not Advertised', color: 'text-gray-400', dotColor: 'bg-gray-500' },
  { key: 'advertised', label: 'Advertised', color: 'text-blue-400', dotColor: 'bg-blue-500' },
  { key: 'evaluation', label: 'Evaluation', color: 'text-gold-400', dotColor: 'bg-gold-500' },
  { key: 'nptab_no_objection', label: 'NPTAB / No Objection', color: 'text-purple-400', dotColor: 'bg-purple-500' },
  { key: 'contract_awarded', label: 'Contract Awarded', color: 'text-emerald-400', dotColor: 'bg-emerald-500' },
];

const STAGE_HEADER_COLORS: Record<ProcurementStage, string> = {
  not_advertised: 'border-gray-500/40',
  advertised: 'border-blue-500/40',
  evaluation: 'border-gold-500/40',
  nptab_no_objection: 'border-purple-500/40',
  contract_awarded: 'border-emerald-500/40',
};

const TRELLO_LABEL_COLORS: Record<string, string> = {
  green: 'bg-emerald-500/25 text-emerald-300',
  yellow: 'bg-amber-500/25 text-amber-300',
  orange: 'bg-orange-500/25 text-orange-300',
  red: 'bg-red-500/25 text-red-300',
  purple: 'bg-purple-500/25 text-purple-300',
  blue: 'bg-blue-500/25 text-blue-300',
  sky: 'bg-sky-500/25 text-sky-300',
  lime: 'bg-lime-500/25 text-lime-300',
  pink: 'bg-pink-500/25 text-pink-300',
  black: 'bg-slate-500/25 text-slate-300',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TrelloProcurementPage() {
  const [items, setItems] = useState<ProcurementItem[]>([]);
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [agencyFilter, setAgencyFilter] = useState<string>('all');

  // Fetch boards + items
  const fetchData = useCallback(async () => {
    const [boardsRes, itemsRes] = await Promise.all([
      supabase
        .from('procurement_boards')
        .select('id, agency, board_name, trello_board_id, last_synced_at')
        .eq('is_active', true)
        .order('created_at'),
      supabase
        .from('procurement_items')
        .select('*, board:procurement_boards!inner(agency, board_name, last_synced_at)')
        .order('last_activity_at', { ascending: false }),
    ]);

    if (boardsRes.data) setBoards(boardsRes.data);
    if (itemsRes.data) setItems(itemsRes.data as ProcurementItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Supabase realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('procurement_items_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'procurement_items' },
        () => {
          // Re-fetch on any change for simplicity
          fetchData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // Sync all active boards
  const handleSync = async () => {
    setSyncing(true);
    try {
      for (const board of boards) {
        await fetch('/api/integrations/trello/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boardId: board.trello_board_id }),
        });
      }
      await fetchData();
    } finally {
      setSyncing(false);
    }
  };

  // Filter + group
  const filteredItems = useMemo(() => {
    if (agencyFilter === 'all') return items;
    return items.filter((i) => i.board?.agency === agencyFilter);
  }, [items, agencyFilter]);

  const grouped = useMemo(() => {
    const map: Record<ProcurementStage, ProcurementItem[]> = {
      not_advertised: [],
      advertised: [],
      evaluation: [],
      nptab_no_objection: [],
      contract_awarded: [],
    };
    for (const item of filteredItems) {
      (map[item.stage] ?? map.not_advertised).push(item);
    }
    return map;
  }, [filteredItems]);

  const agencies = useMemo(
    () => [...new Set(boards.map((b) => b.agency))].sort(),
    [boards],
  );

  const lastSyncedAt = useMemo(() => {
    const dates = boards
      .map((b) => b.last_synced_at)
      .filter(Boolean) as string[];
    if (dates.length === 0) return null;
    return dates.reduce((a, b) => (a < b ? a : b));
  }, [boards]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center flex-wrap gap-3 md:gap-4">
        <Link
          href="/procurement"
          className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors touch-active"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gold-500/20 flex items-center justify-center">
            <ClipboardCheck className="h-4 w-4 md:h-5 md:w-5 text-gold-500" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-white">Trello Procurement</h1>
            <p className="text-xs md:text-sm text-navy-600">
              Live pipeline from agency Trello boards
            </p>
          </div>
        </div>
      </div>

      {/* Top bar: filter + sync */}
      <div className="flex flex-wrap items-center gap-3">
        {agencies.length > 1 && (
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-navy-600" />
            <select
              value={agencyFilter}
              onChange={(e) => setAgencyFilter(e.target.value)}
              className="bg-navy-900 border border-navy-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            >
              <option value="all">All Agencies</option>
              {agencies.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-3 ml-auto">
          {lastSyncedAt && (
            <span className="text-xs text-navy-600">
              Last synced: {relativeTime(lastSyncedAt)}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing || boards.length === 0}
            className="btn-navy flex items-center gap-2 text-sm px-3 py-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <SummaryStats items={filteredItems} />

      {/* Kanban board */}
      <ErrorBoundary fallbackTitle="Failed to load pipeline">
        {boards.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-12 w-12" />}
            title="No Trello boards connected"
            description="Register a Trello board to start syncing procurement data."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-4">
            {STAGES.map((stage) => (
              <StageColumn
                key={stage.key}
                stage={stage}
                items={grouped[stage.key]}
              />
            ))}
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary Stats
// ---------------------------------------------------------------------------

function SummaryStats({ items }: { items: ProcurementItem[] }) {
  const total = items.length;
  if (total === 0) return null;

  const counts = STAGES.map((s) => ({
    ...s,
    count: items.filter((i) => i.stage === s.key).length,
  }));

  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-6 flex-wrap">
        <div>
          <p className="text-xs text-navy-600 uppercase tracking-wider">Total Items</p>
          <p className="text-2xl font-bold text-white">{total}</p>
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="flex rounded-full overflow-hidden h-3 bg-navy-800">
            {counts.map((s) =>
              s.count > 0 ? (
                <div
                  key={s.key}
                  className={`${s.dotColor} transition-all duration-300`}
                  style={{ width: `${(s.count / total) * 100}%` }}
                  title={`${s.label}: ${s.count}`}
                />
              ) : null,
            )}
          </div>
          <div className="flex gap-4 mt-2 flex-wrap">
            {counts.map((s) => (
              <span key={s.key} className={`text-xs ${s.color} flex items-center gap-1`}>
                <span className={`w-2 h-2 rounded-full ${s.dotColor}`} />
                {s.label}: {s.count}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage Column
// ---------------------------------------------------------------------------

function StageColumn({
  stage,
  items,
}: {
  stage: (typeof STAGES)[number];
  items: ProcurementItem[];
}) {
  return (
    <div className="flex flex-col">
      {/* Column header */}
      <div
        className={`flex items-center justify-between px-3 py-2 rounded-t-lg border-t-2 ${STAGE_HEADER_COLORS[stage.key]} bg-navy-900/60`}
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${stage.dotColor}`} />
          <span className={`text-sm font-semibold ${stage.color}`}>{stage.label}</span>
        </div>
        <span className="text-xs text-navy-600 bg-navy-800/60 px-2 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 bg-navy-950/40 rounded-b-lg min-h-[120px]">
        {items.length === 0 ? (
          <p className="text-xs text-navy-600 text-center py-6">No items</p>
        ) : (
          items.map((item) => <ItemCard key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item Card
// ---------------------------------------------------------------------------

function ItemCard({ item }: { item: ProcurementItem }) {
  const agency = item.board?.agency;

  return (
    <a
      href={item.trello_url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="card-premium p-3 hover:ring-1 hover:ring-gold-500/30 transition-all group cursor-pointer block"
    >
      {/* Agency badge */}
      {agency && (
        <Badge variant="gold" className="mb-2 text-[10px]">
          {agency}
        </Badge>
      )}

      {/* Title */}
      <h4 className="text-sm font-medium text-white leading-snug mb-2 group-hover:text-gold-400 transition-colors">
        {item.title}
      </h4>

      {/* Labels */}
      {item.labels && item.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {item.labels.map((label) => (
            <span
              key={label.id}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                TRELLO_LABEL_COLORS[label.color ?? ''] ?? 'bg-navy-700/40 text-slate-400'
              }`}
            >
              {label.name || label.color}
            </span>
          ))}
        </div>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-3 text-[11px] text-navy-600 flex-wrap">
        {item.due_date && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(item.due_date)}
          </span>
        )}
        {item.attachments_count > 0 && (
          <span className="flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            {item.attachments_count}
          </span>
        )}
        {item.comments_count > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {item.comments_count}
          </span>
        )}
        {item.last_activity_at && (
          <span className="ml-auto">{relativeTime(item.last_activity_at)}</span>
        )}
      </div>

      {/* External link hint */}
      <div className="flex items-center gap-1 mt-2 text-[10px] text-navy-600 opacity-0 group-hover:opacity-100 transition-opacity">
        <ExternalLink className="h-3 w-3" />
        Open in Trello
      </div>
    </a>
  );
}
