'use client';

import { useState } from 'react';
import {
  Sparkles,
  Flame,
  TrendingDown,
  Users,
} from 'lucide-react';
import type { BriefingData } from './types';
import { Skeleton } from './briefing-shared';

function HeroSkeleton() {
  return (
    <div className="rounded-xl border border-[#d4af37]/20 bg-[#0f1d32] p-6 md:p-8 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <Skeleton className="h-6 w-48" />
      </div>
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-5/6" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-5 w-2/3" />
      <div className="grid grid-cols-3 gap-4 pt-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    </div>
  );
}

export function ExecutiveBriefHero({
  data,
  loading,
  stats,
  calendarToday,
}: {
  data: BriefingData | null;
  loading: boolean;
  stats: { overdue: number; stale: number } | null;
  calendarToday: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const TRUNCATE_LENGTH = 500;
  const needsTruncation = (data?.briefing?.length ?? 0) > TRUNCATE_LENGTH;

  if (loading && !data) return <HeroSkeleton />;

  return (
    <div className={`rounded-xl border bg-[#0f1d32] p-6 md:p-8 transition-all duration-500 ${
      loading ? 'border-[#d4af37]/40 animate-[shimmer_2s_ease-in-out_infinite]' : 'border-[#d4af37]/20'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#d4af37] to-[#b8860b] flex items-center justify-center shadow-lg shadow-[#d4af37]/20">
          <Sparkles className="h-5 w-5 text-[#0a1628]" />
        </div>
        <div>
          <h2 className="text-white font-bold text-xl">Morning Brief</h2>
          {data?.model === 'fallback' && (
            <span className="text-xs text-amber-400 font-medium">Auto-generated summary</span>
          )}
        </div>
      </div>

      {/* Narrative */}
      {loading ? (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4" role="status" aria-label="Loading">
            <div className="w-5 h-5 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            <span className="text-[#d4af37] text-sm font-medium">Generating briefing...</span>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        </div>
      ) : data ? (
        <div className="text-[#94a3b8] text-base leading-relaxed whitespace-pre-line mb-6">
          {needsTruncation && !expanded
            ? data.briefing.slice(0, TRUNCATE_LENGTH).replace(/\s+\S*$/, '') + '...'
            : data.briefing}
          {needsTruncation && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-2 text-[#d4af37] text-sm font-medium hover:underline"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      ) : (
        <p className="text-[#64748b] text-sm mb-6">Briefing unavailable — data sources may be loading.</p>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="relative rounded-xl bg-[#1a2744]/80 border border-[#2d3a52]/50 p-4 overflow-hidden">
          <Flame className="absolute -right-2 -bottom-2 h-16 w-16 text-red-500/5" />
          <p className="text-3xl font-black text-red-400">{stats?.overdue ?? '—'}</p>
          <p className="text-xs text-[#64748b] font-medium uppercase tracking-wider mt-1">Overdue</p>
        </div>
        <div className="relative rounded-xl bg-[#1a2744]/80 border border-[#2d3a52]/50 p-4 overflow-hidden">
          <TrendingDown className="absolute -right-2 -bottom-2 h-16 w-16 text-amber-500/5" />
          <p className="text-3xl font-black text-amber-400">{stats?.stale ?? '—'}</p>
          <p className="text-xs text-[#64748b] font-medium uppercase tracking-wider mt-1">Stale</p>
        </div>
        <div className="relative rounded-xl bg-[#1a2744]/80 border border-[#2d3a52]/50 p-4 overflow-hidden">
          <Users className="absolute -right-2 -bottom-2 h-16 w-16 text-blue-500/5" />
          <p className="text-3xl font-black text-blue-400">{calendarToday}</p>
          <p className="text-xs text-[#64748b] font-medium uppercase tracking-wider mt-1">Meetings</p>
        </div>
      </div>
    </div>
  );
}
