'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Mic,
  AlertTriangle,
  ArrowRight,
  Clock,
  FileText,
} from 'lucide-react';
import type { ActionsData, MeetingNote, MeetingsData, MeetingSummaryData } from './types';
import { AgencyTag, Skeleton, CardsSkeleton } from './briefing-shared';

const AGENCY_EMOJI: Record<string, string> = {
  GPL: '⚡', GWI: '💧', CJIA: '✈️', GCAA: '🛩️',
  MARAD: '🚢', HECI: '🏘️', HAS: '🛬', PPDI: '📋',
  'Cross-Agency': '🔗', InterEnergy: '🔋',
};

const AGENCY_COLORS: Record<string, string> = {
  GPL: 'border-t-amber-500', GWI: 'border-t-blue-500', CJIA: 'border-t-sky-400',
  GCAA: 'border-t-violet-500', MARAD: 'border-t-cyan-500', HECI: 'border-t-emerald-500',
  HAS: 'border-t-orange-400', PPDI: 'border-t-slate-400',
  'Cross-Agency': 'border-t-[#d4af37]', InterEnergy: 'border-t-yellow-500',
};

export function AgenciesSection({ actions, meetings }: { actions: ActionsData | null; meetings: MeetingsData | null }) {
  if (!actions) return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
    </div>
  );

  const pulse = actions.agencyPulse;
  if (pulse.length === 0) {
    return (
      <div className="rounded-xl border border-navy-800/50 bg-[#0f1d32] p-6 text-center">
        <p className="text-navy-600 text-sm">No agency data available.</p>
      </div>
    );
  }

  const meetingsByAgency = useMemo(() => {
    const map: Record<string, MeetingNote> = {};
    if (meetings?.meetings) {
      for (const m of meetings.meetings) {
        if (m.relatedAgency && !map[m.relatedAgency]) map[m.relatedAgency] = m;
      }
    }
    return map;
  }, [meetings]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {pulse.map(ag => {
        const isCritical = ag.healthRatio < 0.5;
        const healthPct = Math.round(ag.healthRatio * 100);
        const overduePct = ag.openCount > 0 ? Math.round((ag.overdueCount / ag.openCount) * 100) : 0;
        const healthColor = ag.healthRatio >= 0.7 ? 'bg-emerald-500' : ag.healthRatio >= 0.4 ? 'bg-amber-500' : 'bg-red-500';
        const healthLabel = ag.healthRatio >= 0.7 ? 'Healthy' : ag.healthRatio >= 0.4 ? 'At Risk' : 'Critical';
        const healthTextColor = ag.healthRatio >= 0.7 ? 'text-emerald-400' : ag.healthRatio >= 0.4 ? 'text-amber-400' : 'text-red-400';
        const latestMeeting = meetingsByAgency[ag.agency];

        return (
          <div
            key={ag.agency}
            className={`rounded-xl border bg-[#0f1d32] p-4 md:p-6 transition-all duration-300 ${
              isCritical ? 'border-red-500/30 animate-[pulse-border_3s_ease-in-out_infinite]' : 'border-navy-800/50 hover:border-navy-800'
            }`}
          >
            {/* Agency header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{AGENCY_EMOJI[ag.agency] || '📊'}</span>
                <span className="text-white font-bold text-lg">{ag.agency}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${healthColor}`} />
                <span className={`text-xs font-semibold ${healthTextColor}`}>{healthLabel}</span>
              </div>
            </div>

            {/* Numbers */}
            <div className="grid grid-cols-3 gap-3 text-center mb-4">
              <div>
                <p className="text-white font-bold text-2xl">{ag.openCount}</p>
                <p className="text-navy-600 text-xs font-medium uppercase tracking-wider">Open</p>
              </div>
              <div>
                <p className={`font-bold text-2xl ${ag.overdueCount > 0 ? 'text-red-400' : 'text-white'}`}>{ag.overdueCount}</p>
                <p className="text-navy-600 text-xs font-medium uppercase tracking-wider">Overdue</p>
              </div>
              <div>
                <p className={`font-bold text-2xl ${ag.staleCount > 0 ? 'text-amber-400' : 'text-white'}`}>{ag.staleCount}</p>
                <p className="text-navy-600 text-xs font-medium uppercase tracking-wider">Stale</p>
              </div>
            </div>

            {/* Health bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-navy-600">Health</span>
                <span className={`text-xs font-bold ${healthTextColor}`}>{healthPct}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-navy-900 overflow-hidden flex">
                {overduePct > 0 && (
                  <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${overduePct}%` }} />
                )}
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${100 - overduePct}%` }} />
              </div>
            </div>

            {/* Latest meeting */}
            {latestMeeting && (
              <div className="rounded-lg bg-navy-900/60 border border-navy-800/30 p-3">
                <p className="text-xs text-navy-600 font-medium uppercase tracking-wider mb-1">Latest Meeting</p>
                <p className="text-slate-400 text-sm font-medium truncate">{latestMeeting.title}</p>
                {latestMeeting.date && (
                  <p className="text-navy-600 text-xs mt-1">{latestMeeting.date}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function IntelSection({ meetings, actions }: { meetings: MeetingsData | null; actions: ActionsData | null }) {
  if (!meetings) return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );

  if (meetings.meetings.length === 0) {
    return (
      <div className="rounded-xl border border-navy-800/50 bg-[#0f1d32] p-8 text-center">
        <FileText className="h-12 w-12 text-navy-800 mx-auto mb-3" />
        <p className="text-navy-600 text-base">No meeting notes from the last 7 days.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {meetings.meetings.map(m => {
        const relActions = actions?.overdue?.filter(a =>
          a.sourceMeeting && a.sourceMeeting.toLowerCase().includes(m.title.toLowerCase().slice(0, 20))
        ) || [];
        const topBorder = m.relatedAgency ? (AGENCY_COLORS[m.relatedAgency] || 'border-t-[#2d3a52]') : 'border-t-[#2d3a52]';

        return (
          <a
            key={m.id}
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`block rounded-xl border border-navy-800/50 border-t-2 ${topBorder} bg-[#0f1d32] p-4 md:p-6 hover:border-navy-800 transition-all duration-200 group`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-white text-base font-bold group-hover:text-gold-500 transition-colors">{m.title}</p>
                <div className="flex items-center gap-2 mt-2">
                  {m.date && <span className="text-navy-600 text-xs font-medium">{m.date}</span>}
                  {m.category && <AgencyTag agency={m.category} />}
                  {m.relatedAgency && m.relatedAgency !== m.category && <AgencyTag agency={m.relatedAgency} />}
                </div>
              </div>
              {relActions.length > 0 && (
                <span className="rounded-lg bg-gold-500/15 text-gold-500 font-bold px-3 py-1 text-sm shrink-0">
                  {relActions.length} actions
                </span>
              )}
            </div>
            {m.summary && (
              <p className="text-slate-400 text-sm leading-relaxed line-clamp-3">{m.summary}</p>
            )}
          </a>
        );
      })}
    </div>
  );
}

export function MeetingsWeekSection({ data }: { data: MeetingSummaryData | null }) {
  if (!data) return <Skeleton className="h-36 rounded-xl" />;

  return (
    <div className="rounded-xl border border-navy-800/50 bg-[#0f1d32] p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Mic className="h-5 w-5 text-gold-500" />
          <h3 className="text-lg font-bold text-white">Meetings</h3>
        </div>
        <span className="rounded-lg bg-gold-500/15 text-gold-500 font-bold px-3 py-1 text-sm">
          {data.meetingsThisWeek} this week
        </span>
      </div>

      {data.actions.length > 0 ? (
        <div className="space-y-3 mb-4">
          <p className="text-xs text-navy-600 font-bold uppercase tracking-wider">Open Actions Due This Week</p>
          {data.actions.map(a => (
            <div
              key={a.id}
              className="rounded-xl border border-navy-800/50 bg-[#0f1d32] p-4 hover:border-navy-800 transition-all duration-200"
            >
              <p className="text-white text-sm font-medium">{a.task}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {a.meeting_title && (
                  <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-navy-900 text-slate-400 border border-navy-800/50">
                    {a.meeting_title}
                  </span>
                )}
                {a.due_date && (
                  <span className="flex items-center gap-1 text-xs text-navy-600">
                    <Clock className="h-3 w-3" />
                    {a.due_date}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-navy-600 text-sm mb-4">No meeting actions due this week.</p>
      )}

      {/* Needs Review banner */}
      {data.needsReview && data.needsReview.total > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <p className="text-amber-200 text-sm font-medium">
              {data.needsReview.total} meeting action item{data.needsReview.total !== 1 ? 's' : ''} need{data.needsReview.total === 1 ? 's' : ''} your review
            </p>
          </div>
          <div className="space-y-1.5">
            {data.needsReview.byMeeting.map((m) => (
              <Link
                key={m.meeting_id}
                href="/meetings"
                className="flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
              >
                <span>{m.meeting_title}</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">
                  {m.count}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <Link
        href="/meetings"
        className="flex items-center gap-1.5 text-gold-500 text-sm font-medium hover:underline"
      >
        View all meetings <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
