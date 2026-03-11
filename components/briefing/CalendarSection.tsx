'use client';

import { useState, useMemo } from 'react';
import {
  Calendar,
  CalendarPlus,
  MapPin,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { CalendarEvent, CalendarData, ActionsData } from './types';
import { AgencyTag, CardsSkeleton, SectionError } from './briefing-shared';

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
            ? 'border-gold-500 bg-gold-500/20 shadow-[0_0_12px_rgba(212,175,55,0.3)]'
            : event.agency ? 'border-gold-500/60 bg-gold-500/10' : 'border-navy-800 bg-[#0f1d32]'
        }`}>
          {isFirst && <div className="w-2 h-2 rounded-full bg-gold-500" />}
        </div>
        <div className="w-0.5 flex-1 bg-gradient-to-b from-[#d4af37]/30 to-[#2d3a52]/30" />
      </div>

      <div
        className={`rounded-xl border border-navy-800/50 bg-[#0f1d32] p-4 md:p-5 mb-4 transition-all duration-200 ${
          relatedActions.length > 0 ? 'cursor-pointer hover:border-gold-500/30' : 'hover:border-navy-800'
        }`}
        onClick={() => relatedActions.length > 0 && setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-gold-500 text-lg font-bold">{event.allDay ? 'All Day' : event.start}</p>
            <p className="text-white text-base font-semibold mt-1">{event.summary}</p>
            {event.location && (
              <div className="flex items-center gap-1.5 mt-2">
                <MapPin className="h-4 w-4 text-navy-600" />
                <span className="text-slate-400 text-sm">{event.location}</span>
              </div>
            )}
            {event.attendees.length > 0 && (
              <p className="text-navy-600 text-xs mt-2">
                {event.attendees.slice(0, 4).join(', ')}{event.attendees.length > 4 ? ` +${event.attendees.length - 4}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {event.agency && <AgencyTag agency={event.agency} />}
            {relatedActions.length > 0 && (
              <>
                <span className="rounded-lg bg-gold-500/15 text-gold-500 font-bold px-3 py-1 text-sm">
                  {relatedActions.length} open
                </span>
                {expanded
                  ? <ChevronDown className="h-4 w-4 text-navy-600" />
                  : <ChevronRight className="h-4 w-4 text-navy-600" />
                }
              </>
            )}
          </div>
        </div>

        {expanded && relatedActions.length > 0 && (
          <div className="mt-4 pt-4 border-t border-navy-800/30 space-y-2">
            <p className="text-xs text-navy-600 font-bold uppercase tracking-wider mb-2">Meeting Prep — Open Actions</p>
            {relatedActions.slice(0, 5).map(a => (
              <div key={a.id} className="flex items-center gap-3 py-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  a.priority === 'High' ? 'bg-red-500' : a.priority === 'Medium' ? 'bg-amber-500' : 'bg-navy-600'
                }`} />
                <span className="text-slate-400 text-sm truncate flex-1">{a.title}</span>
                {a.overdueDays > 0 && (
                  <span className="rounded-lg bg-red-500/15 text-red-400 font-bold px-2 py-0.5 text-xs shrink-0">{a.overdueDays}d</span>
                )}
              </div>
            ))}
            {relatedActions.length > 5 && (
              <p className="text-navy-600 text-xs">+{relatedActions.length - 5} more</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ScheduleSection({ calendar, actions, onNewEvent }: { calendar: CalendarData | null; actions: ActionsData | null; onNewEvent: () => void }) {
  if (!calendar) return <CardsSkeleton />;

  if (calendar.authRequired) {
    return <SectionError message="Calendar disconnected — reconnect from admin settings." />;
  }

  const { today, upcoming } = calendar;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Schedule</h3>
        <button
          onClick={onNewEvent}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gold-500 text-navy-950 text-sm font-medium hover:bg-[#c9a432] transition-colors"
        >
          <CalendarPlus className="h-4 w-4" />
          New Event
        </button>
      </div>

      {today.length === 0 && upcoming.length === 0 ? (
        <div className="rounded-xl border border-navy-800/50 bg-[#0f1d32] p-8 text-center">
          <Calendar className="h-12 w-12 text-navy-800 mx-auto mb-3" />
          <p className="text-navy-600 text-base">No events scheduled.</p>
        </div>
      ) : (
        <>
          {today.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-white mb-4">Today</h3>
              {today.map((ev, i) => <TimelineEvent key={ev.id} event={ev} actions={actions} isFirst={i === 0} />)}
            </div>
          )}
          {upcoming.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-slate-400 mb-4">Upcoming</h3>
              {upcoming.map(ev => <TimelineEvent key={ev.id} event={ev} actions={actions} isFirst={false} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
