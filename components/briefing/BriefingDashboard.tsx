'use client';

import { useEffect, useReducer, useCallback, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import {
  RefreshCw,
  Sparkles,
  Calendar,
  Building2,
  FileText,
  ListChecks,
  Ghost,
} from 'lucide-react';
import { CreateEventModal } from '@/components/calendar/CreateEventModal';
import type { ActionsData, CalendarData, MeetingsData, MeetingSummaryData, BriefingData } from './types';
import { SectionError } from './briefing-shared';
import { ExecutiveBriefHero } from './BriefingHeader';
import { TriageSection, StaleSection } from './TaskSection';
import { ScheduleSection } from './CalendarSection';
import { AgenciesSection, IntelSection, MeetingsWeekSection } from './QuickActions';

const TABS = [
  { id: 'brief', label: 'Brief', icon: Sparkles },
  { id: 'triage', label: 'Triage', icon: ListChecks },
  { id: 'stale', label: 'Stale', icon: Ghost },
  { id: 'agencies', label: 'Agencies', icon: Building2 },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'intel', label: 'Intel', icon: FileText },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ── Reducer ──────────────────────────────────────────────────────────────────

interface BriefingState {
  activeTab: TabId;
  actions: ActionsData | null;
  calendar: CalendarData | null;
  meetings: MeetingsData | null;
  meetingSummary: MeetingSummaryData | null;
  briefing: BriefingData | null;
  actionsError: string | null;
  calendarError: string | null;
  meetingsError: string | null;
  briefingLoading: boolean;
  refreshing: boolean;
  showCreateEvent: boolean;
}

type BriefingAction =
  | { type: 'SET_TAB'; tab: TabId }
  | { type: 'SET_ACTIONS'; data: ActionsData }
  | { type: 'SET_ACTIONS_ERROR'; error: string }
  | { type: 'SET_CALENDAR'; data: CalendarData }
  | { type: 'SET_CALENDAR_ERROR'; error: string }
  | { type: 'SET_MEETINGS'; data: MeetingsData }
  | { type: 'SET_MEETINGS_ERROR'; error: string }
  | { type: 'SET_MEETING_SUMMARY'; data: MeetingSummaryData }
  | { type: 'SET_BRIEFING'; data: BriefingData }
  | { type: 'SET_BRIEFING_LOADING'; loading: boolean }
  | { type: 'SET_REFRESHING'; refreshing: boolean }
  | { type: 'SET_SHOW_CREATE_EVENT'; show: boolean };

const initialState: BriefingState = {
  activeTab: 'brief',
  actions: null,
  calendar: null,
  meetings: null,
  meetingSummary: null,
  briefing: null,
  actionsError: null,
  calendarError: null,
  meetingsError: null,
  briefingLoading: true,
  refreshing: false,
  showCreateEvent: false,
};

function briefingReducer(state: BriefingState, action: BriefingAction): BriefingState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.tab };
    case 'SET_ACTIONS':
      return { ...state, actions: action.data, actionsError: null };
    case 'SET_ACTIONS_ERROR':
      return { ...state, actionsError: action.error };
    case 'SET_CALENDAR':
      return { ...state, calendar: action.data, calendarError: null };
    case 'SET_CALENDAR_ERROR':
      return { ...state, calendarError: action.error };
    case 'SET_MEETINGS':
      return { ...state, meetings: action.data, meetingsError: null };
    case 'SET_MEETINGS_ERROR':
      return { ...state, meetingsError: action.error };
    case 'SET_MEETING_SUMMARY':
      return { ...state, meetingSummary: action.data };
    case 'SET_BRIEFING':
      return { ...state, briefing: action.data };
    case 'SET_BRIEFING_LOADING':
      return { ...state, briefingLoading: action.loading };
    case 'SET_REFRESHING':
      return { ...state, refreshing: action.refreshing };
    case 'SET_SHOW_CREATE_EVENT':
      return { ...state, showCreateEvent: action.show };
    default:
      return state;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function BriefingDashboard() {
  const [state, dispatch] = useReducer(briefingReducer, initialState);
  const {
    activeTab, actions, calendar, meetings, meetingSummary, briefing,
    actionsError, calendarError, meetingsError, briefingLoading, refreshing, showCreateEvent,
  } = state;
  const tabsRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async () => {
    const [actionsP, calendarP, meetingsP, meetingSummaryP] = await Promise.allSettled([
      fetch('/api/briefing/actions').then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))),
      fetch('/api/briefing/calendar').then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))),
      fetch('/api/briefing/meetings').then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))),
      fetch('/api/meetings/summary').then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))),
    ]);

    if (actionsP.status === 'fulfilled') dispatch({ type: 'SET_ACTIONS', data: actionsP.value });
    else dispatch({ type: 'SET_ACTIONS_ERROR', error: 'Failed to load actions' });

    if (calendarP.status === 'fulfilled') dispatch({ type: 'SET_CALENDAR', data: calendarP.value });
    else dispatch({ type: 'SET_CALENDAR_ERROR', error: 'Failed to load calendar' });

    if (meetingsP.status === 'fulfilled') dispatch({ type: 'SET_MEETINGS', data: meetingsP.value });
    else dispatch({ type: 'SET_MEETINGS_ERROR', error: 'Failed to load meetings' });

    if (meetingSummaryP.status === 'fulfilled') dispatch({ type: 'SET_MEETING_SUMMARY', data: meetingSummaryP.value });
  }, []);

  const fetchBriefing = useCallback(async () => {
    dispatch({ type: 'SET_BRIEFING_LOADING', loading: true });
    try {
      const res = await fetch('/api/briefing/generate');
      if (!res.ok) throw new Error(`${res.status}`);
      dispatch({ type: 'SET_BRIEFING', data: await res.json() });
    } catch {
      // card will show empty state
    } finally {
      dispatch({ type: 'SET_BRIEFING_LOADING', loading: false });
    }
  }, []);

  useEffect(() => {
    fetchAll();
    fetchBriefing();
  }, [fetchAll, fetchBriefing]);

  const handleRefresh = useCallback(async () => {
    dispatch({ type: 'SET_REFRESHING', refreshing: true });
    await Promise.all([fetchAll(), fetchBriefing()]);
    dispatch({ type: 'SET_REFRESHING', refreshing: false });
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
          <p className="text-navy-600 text-xs font-semibold uppercase tracking-wider mb-1">Daily Briefing</p>
          <h1 className="text-white text-2xl md:text-3xl font-bold">{format(new Date(), 'EEEE, MMMM d')}</h1>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-navy-800/50 bg-[#0f1d32] text-slate-400 text-sm font-medium hover:text-white hover:border-gold-500/30 transition-all duration-200 disabled:opacity-50 min-h-[44px]"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span className="hidden md:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Tab Bar */}
      <div
        ref={tabsRef}
        className="flex gap-1 overflow-x-auto scrollbar-hide border-b border-navy-800/30 pb-px"
      >
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => dispatch({ type: 'SET_TAB', tab: tab.id })}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold whitespace-nowrap rounded-t-lg transition-all duration-200 shrink-0 min-h-[44px] ${
                isActive
                  ? 'text-gold-500 border-b-2 border-gold-500 bg-gold-500/5'
                  : 'text-navy-600 hover:text-slate-400 border-b-2 border-transparent'
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
            <MeetingsWeekSection data={meetingSummary} />
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
          calendarError ? <SectionError message={calendarError} /> : <ScheduleSection calendar={calendar} actions={actions} onNewEvent={() => dispatch({ type: 'SET_SHOW_CREATE_EVENT', show: true })} />
        )}

        {activeTab === 'intel' && (
          meetingsError ? <SectionError message={meetingsError} /> : <IntelSection meetings={meetings} actions={actions} />
        )}
      </div>

      <CreateEventModal
        isOpen={showCreateEvent}
        onClose={() => dispatch({ type: 'SET_SHOW_CREATE_EVENT', show: false })}
      />
    </div>
  );
}
