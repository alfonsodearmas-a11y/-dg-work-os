'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import {
  RefreshCw,
  Sparkles,
  AlertTriangle,
  Calendar,
  Building2,
  FileText,
  ListChecks,
  Ghost,
  MapPin,
  ChevronDown,
  ChevronRight,
  Clock,
  Flame,
  Users,
  TrendingDown,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Action {
  id: string;
  title: string;
  agency: string | null;
  assignee: string | null;
  dueDate: string | null;
  priority: string | null;
  status: string | null;
  sourceMeeting: string | null;
  notes: string | null;
  url: string;
  overdueDays: number;
  staleDays: number;
  urgencyScore: number;
}

interface AgencyPulse {
  agency: string;
  openCount: number;
  overdueCount: number;
  staleCount: number;
  healthRatio: number;
}

interface ActionsData {
  overdue: Action[];
  dueToday: Action[];
  dueThisWeek: Action[];
  stale: Action[];
  agencyPulse: AgencyPulse[];
  summary: {
    totalOpen: number;
    totalOverdue: number;
    totalStale: number;
    criticalAgencies: string[];
  };
}

interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  attendees: string[];
  agency: string | null;
}

interface CalendarData {
  today: CalendarEvent[];
  upcoming: CalendarEvent[];
  authRequired?: boolean;
}

interface MeetingNote {
  id: string;
  title: string;
  date: string | null;
  category: string | null;
  summary: string | null;
  relatedAgency: string | null;
  url: string;
}

interface MeetingsData {
  meetings: MeetingNote[];
}

interface BriefingData {
  briefing: string;
  generatedAt: string;
  model: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'brief', label: 'Brief', icon: Sparkles },
  { id: 'triage', label: 'Triage', icon: ListChecks },
  { id: 'stale', label: 'Stale', icon: Ghost },
  { id: 'agencies', label: 'Agencies', icon: Building2 },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'intel', label: 'Intel', icon: FileText },
] as const;

type TabId = (typeof TABS)[number]['id'];

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

// ─── Skeletons ───────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#1a2744] rounded-lg ${className}`} />;
}

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

function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}

// ─── Small UI ────────────────────────────────────────────────────────────────

function AgencyTag({ agency }: { agency: string | null }) {
  if (!agency) return null;
  return (
    <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-[#1a2744] text-[#94a3b8] border border-[#2d3a52]/50">
      {agency}
    </span>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 flex items-center gap-4">
      <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
      <p className="text-red-400 text-sm">{message}</p>
    </div>
  );
}

// ─── Executive Brief Hero ────────────────────────────────────────────────────

function ExecutiveBriefHero({
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
          <div className="flex items-center gap-3 mb-4">
            <div className="w-5 h-5 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
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
          {data.briefing}
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

// ─── Severity Strip — Overdue Items ──────────────────────────────────────────

function SeverityCard({ action }: { action: Action }) {
  const borderColor =
    action.overdueDays >= 7 ? 'border-l-red-500 bg-red-500/[0.03]' :
    action.overdueDays >= 3 ? 'border-l-amber-500' : 'border-l-[#2d3a52]';

  return (
    <a
      href={action.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-xl border border-[#2d3a52]/50 ${borderColor} border-l-4 bg-[#0f1d32] p-4 md:p-5 hover:translate-x-1 hover:border-[#2d3a52] transition-all duration-200 group`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-white text-base font-medium group-hover:text-[#d4af37] transition-colors">
            {action.title}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <AgencyTag agency={action.agency} />
            {action.assignee && (
              <span className="text-xs text-[#64748b] font-medium">{action.assignee}</span>
            )}
          </div>
        </div>
        <span className="rounded-lg bg-red-500/20 text-red-400 font-bold px-3 py-1 text-sm whitespace-nowrap shrink-0">
          {action.overdueDays}d overdue
        </span>
      </div>
    </a>
  );
}

function TriageSection({ actions, compact = false }: { actions: ActionsData | null; compact?: boolean }) {
  if (!actions) return <CardsSkeleton />;

  const { overdue, dueToday, dueThisWeek } = actions;
  const hasItems = overdue.length > 0 || dueToday.length > 0 || dueThisWeek.length > 0;

  if (!hasItems) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-[#0f1d32] p-6 text-center">
        <p className="text-emerald-400 text-base font-medium">All clear — no action items requiring attention.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {overdue.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <h3 className="text-lg font-bold text-red-400">Overdue</h3>
            </div>
            <span className="rounded-lg bg-red-500/15 text-red-400 font-bold px-3 py-1 text-sm">{overdue.length}</span>
          </div>
          <div className="space-y-3">
            {(compact ? overdue.slice(0, 5) : overdue).map(a => (
              <SeverityCard key={a.id} action={a} />
            ))}
          </div>
          {compact && overdue.length > 5 && (
            <p className="text-[#64748b] text-xs mt-3">+{overdue.length - 5} more overdue items</p>
          )}
        </div>
      )}

      {dueToday.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#d4af37]">Due Today</h3>
            <span className="rounded-lg bg-[#d4af37]/15 text-[#d4af37] font-bold px-3 py-1 text-sm">{dueToday.length}</span>
          </div>
          <div className="space-y-3">
            {dueToday.map(a => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-[#2d3a52]/50 border-l-4 border-l-[#d4af37] bg-[#0f1d32] p-4 md:p-5 hover:translate-x-1 hover:border-[#2d3a52] transition-all duration-200 group"
              >
                <p className="text-white text-base font-medium group-hover:text-[#d4af37] transition-colors">{a.title}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <AgencyTag agency={a.agency} />
                  {a.assignee && <span className="text-xs text-[#64748b] font-medium">{a.assignee}</span>}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {dueThisWeek.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#94a3b8]">This Week</h3>
            <span className="rounded-lg bg-[#1a2744] text-[#94a3b8] font-bold px-3 py-1 text-sm">{dueThisWeek.length}</span>
          </div>
          <div className="space-y-3">
            {(compact ? dueThisWeek.slice(0, 3) : dueThisWeek).map(a => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-[#2d3a52]/50 bg-[#0f1d32] p-4 md:p-5 hover:translate-x-1 hover:border-[#2d3a52] transition-all duration-200 group"
              >
                <p className="text-white text-base font-medium group-hover:text-[#d4af37] transition-colors">{a.title}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <AgencyTag agency={a.agency} />
                  {a.assignee && <span className="text-xs text-[#64748b] font-medium">{a.assignee}</span>}
                </div>
              </a>
            ))}
          </div>
          {compact && dueThisWeek.length > 3 && (
            <p className="text-[#64748b] text-xs mt-3">+{dueThisWeek.length - 3} more this week</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stale Items — Visual Decay ──────────────────────────────────────────────

function StaleSection({ actions }: { actions: ActionsData | null }) {
  if (!actions) return <CardsSkeleton />;
  const { stale } = actions;

  if (stale.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-[#0f1d32] p-6 text-center">
        <p className="text-emerald-400 text-base font-medium">No stale items. All actions are being tracked.</p>
      </div>
    );
  }

  const critical = stale.filter(a => a.staleDays >= 21);
  const warning = stale.filter(a => a.staleDays >= 14 && a.staleDays < 21);
  const watch = stale.filter(a => a.staleDays < 14);

  const groups = [
    { label: 'Critical', sublabel: '21+ days silent', items: critical, color: 'red' as const },
    { label: 'Warning', sublabel: '14–20 days', items: warning, color: 'amber' as const },
    { label: 'Watch', sublabel: '7–13 days', items: watch, color: 'default' as const },
  ].filter(g => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <Ghost className="h-5 w-5 text-amber-400" />
        <h3 className="text-lg font-bold text-amber-400">Falling Through the Cracks</h3>
      </div>

      {groups.map(group => (
        <div key={group.label}>
          <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${
            group.color === 'red' ? 'text-red-400' :
            group.color === 'amber' ? 'text-amber-400' : 'text-[#64748b]'
          }`}>
            {group.label} — {group.sublabel}
          </p>
          <div className="space-y-3">
            {group.items.map(a => {
              const barPct = Math.min(100, Math.round((a.staleDays / 30) * 100));
              const barColor =
                a.staleDays >= 21 ? 'bg-red-500' :
                a.staleDays >= 14 ? 'bg-amber-500' : 'bg-[#64748b]';
              const isPulsing = a.staleDays >= 21;

              return (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block rounded-xl border bg-[#0f1d32] p-4 md:p-5 hover:border-[#2d3a52] transition-all duration-200 group ${
                    isPulsing ? 'border-red-500/30 animate-[pulse-border_3s_ease-in-out_infinite]' : 'border-[#2d3a52]/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-base font-medium group-hover:text-[#d4af37] transition-colors">
                        {a.title}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <AgencyTag agency={a.agency} />
                        {a.assignee && <span className="text-xs text-[#64748b] font-medium">{a.assignee}</span>}
                      </div>
                    </div>
                    <span className={`text-2xl font-black shrink-0 ${
                      a.staleDays >= 21 ? 'text-red-400' :
                      a.staleDays >= 14 ? 'text-amber-400' : 'text-[#64748b]'
                    }`}>
                      {a.staleDays}d
                    </span>
                  </div>
                  {/* Decay bar */}
                  <div className="w-full h-1.5 rounded-full bg-[#1a2744] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor} transition-all duration-500`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Agencies Tab ────────────────────────────────────────────────────────────

function AgenciesSection({ actions, meetings }: { actions: ActionsData | null; meetings: MeetingsData | null }) {
  if (!actions) return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
    </div>
  );

  const pulse = actions.agencyPulse;
  if (pulse.length === 0) {
    return (
      <div className="rounded-xl border border-[#2d3a52]/50 bg-[#0f1d32] p-6 text-center">
        <p className="text-[#64748b] text-sm">No agency data available.</p>
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
              isCritical ? 'border-red-500/30 animate-[pulse-border_3s_ease-in-out_infinite]' : 'border-[#2d3a52]/50 hover:border-[#2d3a52]'
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
                <p className="text-[#64748b] text-xs font-medium uppercase tracking-wider">Open</p>
              </div>
              <div>
                <p className={`font-bold text-2xl ${ag.overdueCount > 0 ? 'text-red-400' : 'text-white'}`}>{ag.overdueCount}</p>
                <p className="text-[#64748b] text-xs font-medium uppercase tracking-wider">Overdue</p>
              </div>
              <div>
                <p className={`font-bold text-2xl ${ag.staleCount > 0 ? 'text-amber-400' : 'text-white'}`}>{ag.staleCount}</p>
                <p className="text-[#64748b] text-xs font-medium uppercase tracking-wider">Stale</p>
              </div>
            </div>

            {/* Health bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-[#64748b]">Health</span>
                <span className={`text-xs font-bold ${healthTextColor}`}>{healthPct}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#1a2744] overflow-hidden flex">
                {overduePct > 0 && (
                  <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${overduePct}%` }} />
                )}
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${100 - overduePct}%` }} />
              </div>
            </div>

            {/* Latest meeting */}
            {latestMeeting && (
              <div className="rounded-lg bg-[#1a2744]/60 border border-[#2d3a52]/30 p-3">
                <p className="text-xs text-[#64748b] font-medium uppercase tracking-wider mb-1">Latest Meeting</p>
                <p className="text-[#94a3b8] text-sm font-medium truncate">{latestMeeting.title}</p>
                {latestMeeting.date && (
                  <p className="text-[#64748b] text-xs mt-1">{latestMeeting.date}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Schedule — Timeline ─────────────────────────────────────────────────────

function TimelineEvent({ event, actions, isFirst }: { event: CalendarEvent; actions: ActionsData | null; isFirst: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const relatedActions = useMemo(() => {
    if (!event.agency || !actions) return [];
    return [...(actions.overdue || []), ...(actions.dueToday || []), ...(actions.dueThisWeek || [])]
      .filter(a => a.agency === event.agency);
  }, [event.agency, actions]);

  return (
    <div className="relative pl-10 md:pl-12">
      {/* Timeline line + dot */}
      <div className="absolute left-[11px] top-0 bottom-0 flex flex-col items-center">
        <div className={`w-[22px] h-[22px] rounded-full border-2 shrink-0 flex items-center justify-center z-10 ${
          isFirst
            ? 'border-[#d4af37] bg-[#d4af37]/20 shadow-[0_0_12px_rgba(212,175,55,0.3)]'
            : event.agency ? 'border-[#d4af37]/60 bg-[#d4af37]/10' : 'border-[#2d3a52] bg-[#0f1d32]'
        }`}>
          {isFirst && <div className="w-2 h-2 rounded-full bg-[#d4af37]" />}
        </div>
        <div className="w-0.5 flex-1 bg-gradient-to-b from-[#d4af37]/30 to-[#2d3a52]/30" />
      </div>

      <div
        className={`rounded-xl border border-[#2d3a52]/50 bg-[#0f1d32] p-4 md:p-5 mb-4 transition-all duration-200 ${
          relatedActions.length > 0 ? 'cursor-pointer hover:border-[#d4af37]/30' : 'hover:border-[#2d3a52]'
        }`}
        onClick={() => relatedActions.length > 0 && setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[#d4af37] text-lg font-bold">{event.allDay ? 'All Day' : event.start}</p>
            <p className="text-white text-base font-semibold mt-1">{event.summary}</p>
            {event.location && (
              <div className="flex items-center gap-1.5 mt-2">
                <MapPin className="h-4 w-4 text-[#64748b]" />
                <span className="text-[#94a3b8] text-sm">{event.location}</span>
              </div>
            )}
            {event.attendees.length > 0 && (
              <p className="text-[#64748b] text-xs mt-2">
                {event.attendees.slice(0, 4).join(', ')}{event.attendees.length > 4 ? ` +${event.attendees.length - 4}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {event.agency && <AgencyTag agency={event.agency} />}
            {relatedActions.length > 0 && (
              <>
                <span className="rounded-lg bg-[#d4af37]/15 text-[#d4af37] font-bold px-3 py-1 text-sm">
                  {relatedActions.length} open
                </span>
                {expanded
                  ? <ChevronDown className="h-4 w-4 text-[#64748b]" />
                  : <ChevronRight className="h-4 w-4 text-[#64748b]" />
                }
              </>
            )}
          </div>
        </div>

        {expanded && relatedActions.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#2d3a52]/30 space-y-2">
            <p className="text-xs text-[#64748b] font-bold uppercase tracking-wider mb-2">Meeting Prep — Open Actions</p>
            {relatedActions.slice(0, 5).map(a => (
              <div key={a.id} className="flex items-center gap-3 py-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  a.priority === 'High' ? 'bg-red-500' : a.priority === 'Medium' ? 'bg-amber-500' : 'bg-[#64748b]'
                }`} />
                <span className="text-[#94a3b8] text-sm truncate flex-1">{a.title}</span>
                {a.overdueDays > 0 && (
                  <span className="rounded-lg bg-red-500/15 text-red-400 font-bold px-2 py-0.5 text-xs shrink-0">{a.overdueDays}d</span>
                )}
              </div>
            ))}
            {relatedActions.length > 5 && (
              <p className="text-[#64748b] text-xs">+{relatedActions.length - 5} more</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleSection({ calendar, actions }: { calendar: CalendarData | null; actions: ActionsData | null }) {
  if (!calendar) return <CardsSkeleton />;

  if (calendar.authRequired) {
    return <SectionError message="Calendar disconnected — reconnect from admin settings." />;
  }

  const { today, upcoming } = calendar;

  if (today.length === 0 && upcoming.length === 0) {
    return (
      <div className="rounded-xl border border-[#2d3a52]/50 bg-[#0f1d32] p-8 text-center">
        <Calendar className="h-12 w-12 text-[#2d3a52] mx-auto mb-3" />
        <p className="text-[#64748b] text-base">No events scheduled.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {today.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-white mb-4">Today</h3>
          {today.map((ev, i) => <TimelineEvent key={ev.id} event={ev} actions={actions} isFirst={i === 0} />)}
        </div>
      )}
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-[#94a3b8] mb-4">Upcoming</h3>
          {upcoming.map(ev => <TimelineEvent key={ev.id} event={ev} actions={actions} isFirst={false} />)}
        </div>
      )}
    </div>
  );
}

// ─── Intel — Meeting Card Grid ───────────────────────────────────────────────

function IntelSection({ meetings, actions }: { meetings: MeetingsData | null; actions: ActionsData | null }) {
  if (!meetings) return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );

  if (meetings.meetings.length === 0) {
    return (
      <div className="rounded-xl border border-[#2d3a52]/50 bg-[#0f1d32] p-8 text-center">
        <FileText className="h-12 w-12 text-[#2d3a52] mx-auto mb-3" />
        <p className="text-[#64748b] text-base">No meeting notes from the last 7 days.</p>
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
            className={`block rounded-xl border border-[#2d3a52]/50 border-t-2 ${topBorder} bg-[#0f1d32] p-4 md:p-6 hover:border-[#2d3a52] transition-all duration-200 group`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-white text-base font-bold group-hover:text-[#d4af37] transition-colors">{m.title}</p>
                <div className="flex items-center gap-2 mt-2">
                  {m.date && <span className="text-[#64748b] text-xs font-medium">{m.date}</span>}
                  {m.category && <AgencyTag agency={m.category} />}
                  {m.relatedAgency && m.relatedAgency !== m.category && <AgencyTag agency={m.relatedAgency} />}
                </div>
              </div>
              {relActions.length > 0 && (
                <span className="rounded-lg bg-[#d4af37]/15 text-[#d4af37] font-bold px-3 py-1 text-sm shrink-0">
                  {relActions.length} actions
                </span>
              )}
            </div>
            {m.summary && (
              <p className="text-[#94a3b8] text-sm leading-relaxed line-clamp-3">{m.summary}</p>
            )}
          </a>
        );
      })}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function BriefingDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('brief');
  const [actions, setActions] = useState<ActionsData | null>(null);
  const [calendar, setCalendar] = useState<CalendarData | null>(null);
  const [meetings, setMeetings] = useState<MeetingsData | null>(null);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [actionsError, setActionsError] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [meetingsError, setMeetingsError] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async () => {
    const [actionsP, calendarP, meetingsP] = await Promise.allSettled([
      fetch('/api/briefing/actions').then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))),
      fetch('/api/briefing/calendar').then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))),
      fetch('/api/briefing/meetings').then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))),
    ]);

    if (actionsP.status === 'fulfilled') { setActions(actionsP.value); setActionsError(null); }
    else setActionsError('Failed to load actions');

    if (calendarP.status === 'fulfilled') { setCalendar(calendarP.value); setCalendarError(null); }
    else setCalendarError('Failed to load calendar');

    if (meetingsP.status === 'fulfilled') { setMeetings(meetingsP.value); setMeetingsError(null); }
    else setMeetingsError('Failed to load meetings');
  }, []);

  const fetchBriefing = useCallback(async () => {
    setBriefingLoading(true);
    try {
      const res = await fetch('/api/briefing/generate');
      if (!res.ok) throw new Error(`${res.status}`);
      setBriefing(await res.json());
    } catch {
      // card will show empty state
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    fetchBriefing();
  }, [fetchAll, fetchBriefing]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchAll(), fetchBriefing()]);
    setRefreshing(false);
  }, [fetchAll, fetchBriefing]);

  const stats = useMemo(() => {
    if (!actions) return null;
    return { overdue: actions.summary.totalOverdue, stale: actions.summary.totalStale };
  }, [actions]);

  const calendarTodayCount = calendar?.today?.length ?? 0;

  return (
    <div className="space-y-5 md:space-y-6 relative">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[#64748b] text-xs font-semibold uppercase tracking-wider mb-1">Daily Briefing</p>
          <h1 className="text-white text-2xl md:text-3xl font-bold">{format(new Date(), 'EEEE, MMMM d')}</h1>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#2d3a52]/50 bg-[#0f1d32] text-[#94a3b8] text-sm font-medium hover:text-white hover:border-[#d4af37]/30 transition-all duration-200 disabled:opacity-50 min-h-[44px]"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Tab Bar */}
      <div
        ref={tabsRef}
        className="flex gap-1 overflow-x-auto scrollbar-hide border-b border-[#2d3a52]/30 pb-px"
      >
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold whitespace-nowrap rounded-t-lg transition-all duration-200 shrink-0 min-h-[44px] ${
                isActive
                  ? 'text-[#d4af37] border-b-2 border-[#d4af37] bg-[#d4af37]/5'
                  : 'text-[#64748b] hover:text-[#94a3b8] border-b-2 border-transparent'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.id === 'triage' && stats && stats.overdue > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/15 text-red-400">{stats.overdue}</span>
              )}
              {tab.id === 'stale' && stats && stats.stale > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400">{stats.stale}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'brief' && (
          <div className="space-y-6">
            <ExecutiveBriefHero data={briefing} loading={briefingLoading} stats={stats} calendarToday={calendarTodayCount} />
            {actionsError ? <SectionError message={actionsError} /> : <TriageSection actions={actions} compact />}
            {actions && actions.stale.length > 0 && <StaleSection actions={actions} />}
          </div>
        )}

        {activeTab === 'triage' && (
          actionsError ? <SectionError message={actionsError} /> : <TriageSection actions={actions} />
        )}

        {activeTab === 'stale' && (
          actionsError ? <SectionError message={actionsError} /> : <StaleSection actions={actions} />
        )}

        {activeTab === 'agencies' && (
          actionsError ? <SectionError message={actionsError} /> : <AgenciesSection actions={actions} meetings={meetings} />
        )}

        {activeTab === 'schedule' && (
          calendarError ? <SectionError message={calendarError} /> : <ScheduleSection calendar={calendar} actions={actions} />
        )}

        {activeTab === 'intel' && (
          meetingsError ? <SectionError message={meetingsError} /> : <IntelSection meetings={meetings} actions={actions} />
        )}
      </div>
    </div>
  );
}
