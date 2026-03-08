'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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

export function BriefingDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('brief');
  const [actions, setActions] = useState<ActionsData | null>(null);
  const [calendar, setCalendar] = useState<CalendarData | null>(null);
  const [meetings, setMeetings] = useState<MeetingsData | null>(null);
  const [meetingSummary, setMeetingSummary] = useState<MeetingSummaryData | null>(null);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [actionsError, setActionsError] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [meetingsError, setMeetingsError] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async () => {
    const [actionsP, calendarP, meetingsP, meetingSummaryP] = await Promise.allSettled([
      fetch('/api/briefing/actions').then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))),
      fetch('/api/briefing/calendar').then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))),
      fetch('/api/briefing/meetings').then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))),
      fetch('/api/meetings/summary').then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))),
    ]);

    if (actionsP.status === 'fulfilled') { setActions(actionsP.value); setActionsError(null); }
    else setActionsError('Failed to load actions');

    if (calendarP.status === 'fulfilled') { setCalendar(calendarP.value); setCalendarError(null); }
    else setCalendarError('Failed to load calendar');

    if (meetingsP.status === 'fulfilled') { setMeetings(meetingsP.value); setMeetingsError(null); }
    else setMeetingsError('Failed to load meetings');

    if (meetingSummaryP.status === 'fulfilled') setMeetingSummary(meetingSummaryP.value);
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
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
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
          calendarError ? <SectionError message={calendarError} /> : <ScheduleSection calendar={calendar} actions={actions} onNewEvent={() => setShowCreateEvent(true)} />
        )}

        {activeTab === 'intel' && (
          meetingsError ? <SectionError message={meetingsError} /> : <IntelSection meetings={meetings} actions={actions} />
        )}
      </div>

      <CreateEventModal
        isOpen={showCreateEvent}
        onClose={() => setShowCreateEvent(false)}
      />
    </div>
  );
}
