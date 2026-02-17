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

// ─── Skeleton Components ─────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#1a2744] rounded ${className}`} />;
}

function BriefingSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-[#2d3a52]/50 bg-[#0f1d32]/60 p-4 space-y-3">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

// ─── Small UI Components ─────────────────────────────────────────────────────

function PriorityDot({ priority }: { priority: string | null }) {
  const color = priority === 'High' ? 'bg-red-500' : priority === 'Medium' ? 'bg-amber-500' : 'bg-[#64748b]';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color} shrink-0`} />;
}

function AgencyTag({ agency }: { agency: string | null }) {
  if (!agency) return null;
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#1a2744] text-[#94a3b8] border border-[#2d3a52]/50">
      {agency}
    </span>
  );
}

function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'red' | 'amber' | 'green' | 'gold' | 'default' }) {
  const styles = {
    red: 'bg-red-500/15 text-red-400',
    amber: 'bg-amber-500/15 text-amber-400',
    green: 'bg-emerald-500/15 text-emerald-400',
    gold: 'bg-[#d4af37]/15 text-[#d4af37]',
    default: 'bg-[#1a2744] text-[#94a3b8]',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${styles[variant]}`}>
      {children}
    </span>
  );
}

function HealthDot({ ratio }: { ratio: number }) {
  const color = ratio >= 0.7 ? 'bg-emerald-500' : ratio >= 0.4 ? 'bg-amber-500' : 'bg-red-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-center gap-3">
      <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
      <p className="text-red-400 text-sm">{message}</p>
    </div>
  );
}

// ─── Action Item Row ─────────────────────────────────────────────────────────

function ActionRow({ action }: { action: Action }) {
  return (
    <a
      href={action.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2.5 py-2.5 px-3 -mx-3 rounded-lg hover:bg-[#1a2744]/60 transition-colors group"
    >
      <PriorityDot priority={action.priority} />
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm leading-snug group-hover:text-[#d4af37] transition-colors truncate">
          {action.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <AgencyTag agency={action.agency} />
          {action.assignee && (
            <span className="text-[10px] text-[#64748b]">{action.assignee}</span>
          )}
          {action.overdueDays > 0 && (
            <Badge variant="red">{action.overdueDays}d overdue</Badge>
          )}
          {action.staleDays >= 7 && (
            <Badge variant="amber">{action.staleDays}d stale</Badge>
          )}
        </div>
      </div>
    </a>
  );
}

// ─── Executive Brief Card ────────────────────────────────────────────────────

function ExecutiveBriefCard({ data, loading }: { data: BriefingData | null; loading: boolean }) {
  return (
    <div className="rounded-xl border border-[#d4af37]/30 bg-gradient-to-br from-[#d4af37]/5 to-transparent p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#d4af37] to-[#b8860b] flex items-center justify-center">
          <Sparkles className="h-3.5 w-3.5 text-[#0a1628]" />
        </div>
        <h2 className="text-white font-semibold text-sm">Executive Brief</h2>
        {data?.model === 'fallback' && (
          <Badge variant="amber">Fallback</Badge>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-4 h-4 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#d4af37] text-xs">Generating briefing...</span>
          </div>
          <BriefingSkeleton />
        </div>
      ) : data ? (
        <div className="text-[#94a3b8] text-sm leading-relaxed whitespace-pre-line">
          {data.briefing}
        </div>
      ) : (
        <p className="text-[#64748b] text-sm">No briefing available.</p>
      )}
    </div>
  );
}

// ─── Action Items Triage ─────────────────────────────────────────────────────

function TriageSection({ actions, compact = false }: { actions: ActionsData | null; compact?: boolean }) {
  if (!actions) return <CardSkeleton />;

  const { overdue, dueToday, dueThisWeek } = actions;
  const hasItems = overdue.length > 0 || dueToday.length > 0 || dueThisWeek.length > 0;

  if (!hasItems) {
    return (
      <div className="rounded-xl border border-[#2d3a52]/50 bg-[#0f1d32]/60 p-4 text-center">
        <p className="text-[#64748b] text-sm">No action items requiring attention.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {overdue.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-[#0f1d32]/60 backdrop-blur-sm p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <h3 className="text-red-400 font-semibold text-sm">Overdue</h3>
            </div>
            <Badge variant="red">{overdue.length}</Badge>
          </div>
          <div className="divide-y divide-[#2d3a52]/30">
            {(compact ? overdue.slice(0, 5) : overdue).map(a => (
              <ActionRow key={a.id} action={a} />
            ))}
          </div>
          {compact && overdue.length > 5 && (
            <p className="text-[#64748b] text-xs mt-2">+{overdue.length - 5} more overdue items</p>
          )}
        </div>
      )}

      {(dueToday.length > 0 || dueThisWeek.length > 0) && (
        <div className="rounded-xl border border-[#2d3a52]/50 bg-[#0f1d32]/60 backdrop-blur-sm p-4 md:p-5">
          {dueToday.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[#d4af37] font-semibold text-sm">Due Today</h3>
                <Badge variant="gold">{dueToday.length}</Badge>
              </div>
              <div className="divide-y divide-[#2d3a52]/30">
                {dueToday.map(a => <ActionRow key={a.id} action={a} />)}
              </div>
            </>
          )}

          {dueThisWeek.length > 0 && (
            <div className={dueToday.length > 0 ? 'mt-4 pt-4 border-t border-[#2d3a52]/30' : ''}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[#94a3b8] font-semibold text-sm">This Week</h3>
                <Badge>{dueThisWeek.length}</Badge>
              </div>
              <div className="divide-y divide-[#2d3a52]/30">
                {(compact ? dueThisWeek.slice(0, 3) : dueThisWeek).map(a => (
                  <ActionRow key={a.id} action={a} />
                ))}
              </div>
              {compact && dueThisWeek.length > 3 && (
                <p className="text-[#64748b] text-xs mt-2">+{dueThisWeek.length - 3} more this week</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stale Section ───────────────────────────────────────────────────────────

function StaleSection({ actions }: { actions: ActionsData | null }) {
  if (!actions) return <CardSkeleton />;
  const { stale } = actions;

  if (stale.length === 0) {
    return (
      <div className="rounded-xl border border-[#2d3a52]/50 bg-[#0f1d32]/60 p-4 text-center">
        <p className="text-[#64748b] text-sm">No stale items. All actions are being tracked.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/20 bg-[#0f1d32]/60 backdrop-blur-sm p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Ghost className="h-4 w-4 text-amber-400" />
          <h3 className="text-amber-400 font-semibold text-sm">Falling Through the Cracks</h3>
        </div>
        <Badge variant="amber">{stale.length}</Badge>
      </div>
      <div className="space-y-2">
        {stale.map(a => {
          const severity = a.staleDays >= 14 ? 'red' : a.staleDays >= 10 ? 'amber' : 'default';
          return (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 py-2 px-3 -mx-3 rounded-lg hover:bg-[#1a2744]/60 transition-colors group"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                severity === 'red' ? 'bg-red-500/15 text-red-400' :
                severity === 'amber' ? 'bg-amber-500/15 text-amber-400' :
                'bg-[#1a2744] text-[#94a3b8]'
              }`}>
                {a.staleDays}d
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm leading-snug group-hover:text-[#d4af37] transition-colors truncate">
                  {a.title}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <AgencyTag agency={a.agency} />
                  {a.assignee && <span className="text-[10px] text-[#64748b]">{a.assignee}</span>}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ─── Agencies Tab ────────────────────────────────────────────────────────────

function AgenciesSection({ actions, meetings }: { actions: ActionsData | null; meetings: MeetingsData | null }) {
  if (!actions) return <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>;

  const pulse = actions.agencyPulse;
  if (pulse.length === 0) {
    return (
      <div className="rounded-xl border border-[#2d3a52]/50 bg-[#0f1d32]/60 p-4 text-center">
        <p className="text-[#64748b] text-sm">No agency data available.</p>
      </div>
    );
  }

  const meetingsByAgency = useMemo(() => {
    const map: Record<string, MeetingNote> = {};
    if (meetings?.meetings) {
      for (const m of meetings.meetings) {
        if (m.relatedAgency && !map[m.relatedAgency]) {
          map[m.relatedAgency] = m;
        }
      }
    }
    return map;
  }, [meetings]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {pulse.map(ag => {
        const latestMeeting = meetingsByAgency[ag.agency];
        return (
          <div key={ag.agency} className="rounded-xl border border-[#2d3a52]/50 bg-[#0f1d32]/60 backdrop-blur-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{AGENCY_EMOJI[ag.agency] || '📊'}</span>
                <span className="text-white font-semibold text-sm">{ag.agency}</span>
              </div>
              <HealthDot ratio={ag.healthRatio} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-white font-bold text-lg">{ag.openCount}</p>
                <p className="text-[#64748b] text-[10px] uppercase tracking-wider">Open</p>
              </div>
              <div>
                <p className={`font-bold text-lg ${ag.overdueCount > 0 ? 'text-red-400' : 'text-white'}`}>{ag.overdueCount}</p>
                <p className="text-[#64748b] text-[10px] uppercase tracking-wider">Overdue</p>
              </div>
              <div>
                <p className={`font-bold text-lg ${ag.staleCount > 0 ? 'text-amber-400' : 'text-white'}`}>{ag.staleCount}</p>
                <p className="text-[#64748b] text-[10px] uppercase tracking-wider">Stale</p>
              </div>
            </div>
            {latestMeeting && (
              <div className="mt-3 pt-3 border-t border-[#2d3a52]/30">
                <p className="text-[10px] text-[#64748b] uppercase tracking-wider mb-1">Latest Meeting</p>
                <p className="text-[#94a3b8] text-xs truncate">{latestMeeting.title}</p>
                {latestMeeting.date && (
                  <p className="text-[#64748b] text-[10px] mt-0.5">{latestMeeting.date}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Schedule Tab ────────────────────────────────────────────────────────────

function ScheduleEvent({ event, actions }: { event: CalendarEvent; actions: ActionsData | null }) {
  const [expanded, setExpanded] = useState(false);

  const relatedActions = useMemo(() => {
    if (!event.agency || !actions) return [];
    return [...(actions.overdue || []), ...(actions.dueToday || []), ...(actions.dueThisWeek || [])]
      .filter(a => a.agency === event.agency);
  }, [event.agency, actions]);

  return (
    <div className="relative pl-8">
      {/* Timeline dot + line */}
      <div className="absolute left-0 top-0 bottom-0 flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${
          event.agency ? 'border-[#d4af37] bg-[#d4af37]/20' : 'border-[#2d3a52] bg-[#0f1d32]'
        }`} />
        <div className="w-px flex-1 bg-[#2d3a52]/50" />
      </div>

      <div
        className={`rounded-xl border border-[#2d3a52]/50 bg-[#0f1d32]/60 backdrop-blur-sm p-3 mb-3 ${
          relatedActions.length > 0 ? 'cursor-pointer hover:border-[#d4af37]/30' : ''
        } transition-colors`}
        onClick={() => relatedActions.length > 0 && setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[#d4af37] text-xs font-medium">{event.allDay ? 'All day' : event.start}</p>
            <p className="text-white text-sm font-medium mt-0.5">{event.summary}</p>
            {event.location && (
              <div className="flex items-center gap-1 mt-1">
                <MapPin className="h-3 w-3 text-[#64748b]" />
                <span className="text-[#64748b] text-xs">{event.location}</span>
              </div>
            )}
            {event.attendees.length > 0 && (
              <p className="text-[#64748b] text-[10px] mt-1">{event.attendees.slice(0, 4).join(', ')}{event.attendees.length > 4 ? ` +${event.attendees.length - 4}` : ''}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {event.agency && <AgencyTag agency={event.agency} />}
            {relatedActions.length > 0 && (
              <>
                <Badge variant="gold">{relatedActions.length} actions</Badge>
                {expanded ? <ChevronDown className="h-3 w-3 text-[#64748b]" /> : <ChevronRight className="h-3 w-3 text-[#64748b]" />}
              </>
            )}
          </div>
        </div>

        {expanded && relatedActions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#2d3a52]/30 space-y-1.5">
            <p className="text-[10px] text-[#64748b] uppercase tracking-wider font-semibold mb-1">Meeting Prep — Open Actions</p>
            {relatedActions.slice(0, 5).map(a => (
              <div key={a.id} className="flex items-center gap-2">
                <PriorityDot priority={a.priority} />
                <span className="text-[#94a3b8] text-xs truncate">{a.title}</span>
                {a.overdueDays > 0 && <Badge variant="red">{a.overdueDays}d</Badge>}
              </div>
            ))}
            {relatedActions.length > 5 && (
              <p className="text-[#64748b] text-[10px]">+{relatedActions.length - 5} more</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleSection({ calendar, actions }: { calendar: CalendarData | null; actions: ActionsData | null }) {
  if (!calendar) return <div className="space-y-3"><CardSkeleton /><CardSkeleton /></div>;

  if (calendar.authRequired) {
    return <SectionError message="Calendar disconnected — reconnect from admin settings." />;
  }

  const { today, upcoming } = calendar;

  if (today.length === 0 && upcoming.length === 0) {
    return (
      <div className="rounded-xl border border-[#2d3a52]/50 bg-[#0f1d32]/60 p-4 text-center">
        <Calendar className="h-8 w-8 text-[#2d3a52] mx-auto mb-2" />
        <p className="text-[#64748b] text-sm">No events scheduled.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {today.length > 0 && (
        <div>
          <h3 className="text-white font-semibold text-sm mb-3">Today</h3>
          {today.map(ev => <ScheduleEvent key={ev.id} event={ev} actions={actions} />)}
        </div>
      )}
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-[#94a3b8] font-semibold text-sm mb-3">Upcoming</h3>
          {upcoming.map(ev => <ScheduleEvent key={ev.id} event={ev} actions={actions} />)}
        </div>
      )}
    </div>
  );
}

// ─── Intel Tab ───────────────────────────────────────────────────────────────

function IntelSection({ meetings, actions }: { meetings: MeetingsData | null; actions: ActionsData | null }) {
  if (!meetings) return <div className="space-y-3"><CardSkeleton /><CardSkeleton /></div>;

  if (meetings.meetings.length === 0) {
    return (
      <div className="rounded-xl border border-[#2d3a52]/50 bg-[#0f1d32]/60 p-4 text-center">
        <FileText className="h-8 w-8 text-[#2d3a52] mx-auto mb-2" />
        <p className="text-[#64748b] text-sm">No meeting notes from the last 7 days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {meetings.meetings.map(m => {
        const newActions = actions?.overdue?.filter(a => a.sourceMeeting && a.sourceMeeting.toLowerCase().includes(m.title.toLowerCase().slice(0, 20))) || [];
        return (
          <a
            key={m.id}
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-[#2d3a52]/50 bg-[#0f1d32]/60 backdrop-blur-sm p-4 hover:border-[#d4af37]/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{m.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  {m.date && <span className="text-[#64748b] text-xs">{m.date}</span>}
                  {m.category && <AgencyTag agency={m.category} />}
                  {m.relatedAgency && <AgencyTag agency={m.relatedAgency} />}
                </div>
              </div>
              {newActions.length > 0 && (
                <Badge variant="gold">{newActions.length} actions</Badge>
              )}
            </div>
            {m.summary && (
              <p className="text-[#94a3b8] text-xs leading-relaxed line-clamp-3">{m.summary}</p>
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
  const [dataLoading, setDataLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async () => {
    // Fetch data endpoints in parallel
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

    setDataLoading(false);
  }, []);

  const fetchBriefing = useCallback(async () => {
    setBriefingLoading(true);
    try {
      const res = await fetch('/api/briefing/generate');
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setBriefing(data);
    } catch {
      // Briefing generation failed — the card will show empty state
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

  // Summary stats for the header
  const stats = useMemo(() => {
    if (!actions) return null;
    return {
      overdue: actions.summary.totalOverdue,
      today: actions.dueToday.length,
      stale: actions.summary.totalStale,
    };
  }, [actions]);

  return (
    <div className="space-y-4 md:space-y-5 relative">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[#64748b] text-xs font-semibold uppercase tracking-wider mb-1">Daily Briefing</p>
          <h1 className="text-white text-xl md:text-2xl font-bold">{format(new Date(), 'EEEE, MMMM d')}</h1>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#2d3a52]/50 bg-[#0f1d32]/60 text-[#94a3b8] text-sm hover:text-white hover:border-[#d4af37]/30 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Quick stats ribbon */}
      {stats && (
        <div className="flex items-center gap-3 text-xs">
          {stats.overdue > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="text-red-400 font-medium">{stats.overdue} overdue</span>
            </div>
          )}
          {stats.today > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#d4af37]/10 border border-[#d4af37]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[#d4af37]" />
              <span className="text-[#d4af37] font-medium">{stats.today} due today</span>
            </div>
          )}
          {stats.stale > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="text-amber-400 font-medium">{stats.stale} stale</span>
            </div>
          )}
        </div>
      )}

      {/* Tab Bar */}
      <div
        ref={tabsRef}
        className="flex gap-1 overflow-x-auto scrollbar-hide border-b border-[#2d3a52]/30 pb-px -mx-1 px-1"
      >
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap rounded-t-lg transition-colors shrink-0 ${
                isActive
                  ? 'text-[#d4af37] border-b-2 border-[#d4af37] bg-[#d4af37]/5'
                  : 'text-[#64748b] hover:text-[#94a3b8] border-b-2 border-transparent'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.id === 'triage' && stats && stats.overdue > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-500/15 text-red-400">{stats.overdue}</span>
              )}
              {tab.id === 'stale' && stats && stats.stale > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-400">{stats.stale}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[300px]">
        {/* Brief Tab */}
        {activeTab === 'brief' && (
          <div className="space-y-4">
            <ExecutiveBriefCard data={briefing} loading={briefingLoading} />
            {actionsError ? <SectionError message={actionsError} /> : <TriageSection actions={actions} compact />}
            {actions && actions.stale.length > 0 && (
              <StaleSection actions={actions} />
            )}
          </div>
        )}

        {/* Triage Tab */}
        {activeTab === 'triage' && (
          actionsError ? <SectionError message={actionsError} /> : <TriageSection actions={actions} />
        )}

        {/* Stale Tab */}
        {activeTab === 'stale' && (
          actionsError ? <SectionError message={actionsError} /> : <StaleSection actions={actions} />
        )}

        {/* Agencies Tab */}
        {activeTab === 'agencies' && (
          actionsError ? <SectionError message={actionsError} /> : <AgenciesSection actions={actions} meetings={meetings} />
        )}

        {/* Schedule Tab */}
        {activeTab === 'schedule' && (
          calendarError ? <SectionError message={calendarError} /> : <ScheduleSection calendar={calendar} actions={actions} />
        )}

        {/* Intel Tab */}
        {activeTab === 'intel' && (
          meetingsError ? <SectionError message={meetingsError} /> : <IntelSection meetings={meetings} actions={actions} />
        )}
      </div>
    </div>
  );
}
