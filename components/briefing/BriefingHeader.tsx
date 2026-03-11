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
import { Spinner } from '@/components/ui/Spinner';

function HeroSkeleton() {
  return (
    <div className="rounded-xl border border-gold-500/20 bg-[#0f1d32] p-6 md:p-8 space-y-4">
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
      loading ? 'border-gold-500/40 animate-[shimmer_2s_ease-in-out_infinite]' : 'border-gold-500/20'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#d4af37] to-[#b8860b] flex items-center justify-center shadow-lg shadow-gold-500/20">
          <Sparkles className="h-5 w-5 text-navy-950" />
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
          <div className="flex items-center gap-3 mb-4">
            <Spinner size="sm" />
            <span className="text-gold-500 text-sm font-medium">Generating briefing...</span>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        </div>
      ) : data ? (
        <div className="text-slate-400 text-base leading-relaxed whitespace-pre-line mb-6">
          {needsTruncation && !expanded
            ? data.briefing.slice(0, TRUNCATE_LENGTH).replace(/\s+\S*$/, '') + '...'
            : data.briefing}
          {needsTruncation && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-2 text-gold-500 text-sm font-medium hover:underline"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      ) : (
        <p className="text-navy-600 text-sm mb-6">Briefing unavailable — data sources may be loading.</p>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="relative rounded-xl bg-navy-900/80 border border-navy-800/50 p-4 overflow-hidden">
          <Flame className="absolute -right-2 -bottom-2 h-16 w-16 text-red-500/5" />
          <p className="text-3xl font-black text-red-400">{stats?.overdue ?? '—'}</p>
          <p className="text-xs text-navy-600 font-medium uppercase tracking-wider mt-1">Overdue</p>
        </div>
        <div className="relative rounded-xl bg-navy-900/80 border border-navy-800/50 p-4 overflow-hidden">
          <TrendingDown className="absolute -right-2 -bottom-2 h-16 w-16 text-amber-500/5" />
          <p className="text-3xl font-black text-amber-400">{stats?.stale ?? '—'}</p>
          <p className="text-xs text-navy-600 font-medium uppercase tracking-wider mt-1">Stale</p>
        </div>
        <div className="relative rounded-xl bg-navy-900/80 border border-navy-800/50 p-4 overflow-hidden">
          <Users className="absolute -right-2 -bottom-2 h-16 w-16 text-blue-500/5" />
          <p className="text-3xl font-black text-blue-400">{calendarToday}</p>
          <p className="text-xs text-navy-600 font-medium uppercase tracking-wider mt-1">Meetings</p>
        </div>
      </div>
    </div>
  );
}
