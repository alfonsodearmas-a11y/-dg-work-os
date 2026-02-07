'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  Loader2,
  BookOpen,
  CheckCircle,
  Clock,
  AlertTriangle,
  SkipForward,
} from 'lucide-react';
import { MeetingCard, type MeetingCardData } from '@/components/meetings/MeetingCard';

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<MeetingCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchMeetings = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/meetings?${params}`);
      const data = await res.json();
      setMeetings(data.meetings || []);
      setTotal(data.total || 0);
    } catch {
      // Fail silently
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchMeetings().finally(() => setLoading(false));
  }, [fetchMeetings]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/meetings/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      const parts: string[] = [];
      if (data.synced > 0) parts.push(`${data.synced} new meeting${data.synced !== 1 ? 's' : ''} imported`);
      if (data.processed > 0) parts.push(`${data.processed} processed`);
      if (data.synced === 0 && data.processed === 0) parts.push('Everything up to date');
      if (data.errors?.length > 0) parts.push(`${data.errors.length} error${data.errors.length !== 1 ? 's' : ''}`);
      setSyncResult(parts.join(', '));
      fetchMeetings();
    } catch (error: any) {
      setSyncResult(`Error: ${error.message}`);
    }
    setSyncing(false);
  }

  // Count by status
  const counts = meetings.reduce(
    (acc, m) => {
      acc[m.status] = (acc[m.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Skeleton
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-3xl font-bold text-white">Meetings</h1>
            <p className="text-[#64748b] mt-1 text-xs md:text-sm">AI-powered meeting minutes from Notion</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-premium p-4 animate-pulse h-40">
              <div className="h-5 bg-[#2d3a52] rounded w-20 mb-3" />
              <div className="h-4 bg-[#2d3a52] rounded w-full mb-2" />
              <div className="h-4 bg-[#2d3a52] rounded w-2/3 mb-3" />
              <div className="h-3 bg-[#2d3a52] rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold text-white">Meetings</h1>
          <p className="text-[#64748b] mt-1 text-xs md:text-sm">AI-powered meeting minutes from Notion</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="btn-gold flex items-center gap-2 px-3 py-2 md:px-4 shrink-0"
        >
          {syncing ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> <span className="hidden md:inline">Syncing...</span></>
          ) : (
            <><RefreshCw className="h-4 w-4" /> <span className="hidden md:inline">Sync from Notion</span></>
          )}
        </button>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className={`flex items-center gap-2 p-3 rounded-xl border ${
          syncResult.startsWith('Error')
            ? 'bg-red-500/10 border-red-500/30 text-red-400'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
        }`}>
          {syncResult.startsWith('Error')
            ? <AlertTriangle className="h-4 w-4 shrink-0" />
            : <CheckCircle className="h-4 w-4 shrink-0" />}
          <p className="text-sm">{syncResult}</p>
        </div>
      )}

      {/* ── Stats Bar ── */}
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-[#64748b]">{total} total</span>
          {(counts.completed || 0) > 0 && (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle className="h-3.5 w-3.5" /> {counts.completed} completed
            </span>
          )}
          {(counts.pending || 0) > 0 && (
            <span className="flex items-center gap-1 text-[#64748b]">
              <Clock className="h-3.5 w-3.5" /> {counts.pending} pending
            </span>
          )}
          {(counts.failed || 0) > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {counts.failed} failed
            </span>
          )}
          {(counts.skipped || 0) > 0 && (
            <span className="flex items-center gap-1 text-[#64748b]">
              <SkipForward className="h-3.5 w-3.5" /> {counts.skipped} skipped
            </span>
          )}
        </div>
      )}

      {/* ── Status Filter ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: '', label: 'All', tip: 'Show all meetings' },
          { key: 'completed', label: 'Completed', tip: 'Minutes successfully generated by AI' },
          { key: 'pending', label: 'Pending', tip: 'Imported from Notion, waiting to be processed' },
          { key: 'failed', label: 'Failed', tip: 'AI processing hit an error — can be retried' },
          { key: 'skipped', label: 'Skipped', tip: 'Notion page had no transcript or too little text' },
          { key: 'edited', label: 'Edited', tip: 'AI minutes were manually edited and saved' },
        ]).map(s => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key)}
            title={s.tip}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === s.key
                ? 'bg-[#d4af37]/20 text-[#d4af37] border border-[#d4af37]/30'
                : 'text-[#64748b] hover:text-white hover:bg-[#1a2744]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Meeting Cards Grid ── */}
      {meetings.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <BookOpen className="h-12 w-12 text-[#2d3a52] mx-auto mb-4" />
          <h3 className="text-white font-semibold mb-2">No meetings found</h3>
          <p className="text-[#64748b] text-sm mb-4">
            {statusFilter
              ? 'No meetings match this filter. Try a different status.'
              : 'Click "Sync from Notion" to import your meetings.'}
          </p>
          {!statusFilter && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn-gold inline-flex items-center gap-2 px-4 py-2"
            >
              <RefreshCw className="h-4 w-4" /> Sync from Notion
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {meetings.map(m => (
            <MeetingCard key={m.id} meeting={m} />
          ))}
        </div>
      )}
    </div>
  );
}
