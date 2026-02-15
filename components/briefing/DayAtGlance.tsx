'use client';

import { useMemo, useState, useEffect } from 'react';
import { format, parseISO, differenceInMinutes, isAfter, isBefore } from 'date-fns';
import { Calendar, Clock, Video, MapPin, Plus, AlertTriangle, RefreshCcw } from 'lucide-react';
import { CalendarEvent, detectEventCategory, EventCategory } from '@/lib/calendar-types';
import { calculateDayStats, getNextEvent, getVideoLink } from '@/lib/calendar-utils';

interface DayAtGlanceProps {
  events: CalendarEvent[];
  weekEvents: CalendarEvent[];
  onJoinNextCall?: (url: string) => void;
  onNewEvent?: () => void;
  onEventClick?: (event: CalendarEvent) => void;
  calendarError?: { type: string; message: string } | null;
  dayLabel?: string;
  isToday?: boolean;
}

const CATEGORY_COLORS: Record<EventCategory, string> = {
  ministry: '#4a5568',
  board: '#d4af37',
  external: '#14b8a6',
  personal: '#64748b',
  blocked: '#2d3a52',
};

const CATEGORY_LABELS: Record<EventCategory, string> = {
  ministry: 'Ministry',
  board: 'Board',
  external: 'External',
  personal: 'Personal',
  blocked: 'Blocked',
};

export function DayAtGlance({ events, weekEvents, onJoinNextCall, onNewEvent, onEventClick, calendarError, dayLabel = 'Today', isToday = true }: DayAtGlanceProps) {
  const stats = useMemo(() => calculateDayStats(events), [events]);
  const nextEvent = useMemo(() => getNextEvent(events), [events]);
  const nextVideoLink = nextEvent ? getVideoLink(nextEvent) : null;

  // Find next upcoming meeting even if not today (from weekEvents)
  const nextWeekEvent = useMemo(() => {
    if (nextEvent) return null; // Already have a today event
    const now = new Date();
    const upcoming = weekEvents
      .filter(e => e.start_time && !e.all_day && isAfter(parseISO(e.start_time), now))
      .sort((a, b) => parseISO(a.start_time!).getTime() - parseISO(b.start_time!).getTime());
    return upcoming[0] || null;
  }, [nextEvent, weekEvents]);

  // Live countdown - updates every minute
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    const target = nextEvent?.start_time ? parseISO(nextEvent.start_time) : null;
    if (!target) { setCountdown(''); return; }

    const update = () => {
      const now = new Date();
      if (isAfter(now, target)) { setCountdown('now'); return; }
      const mins = differenceInMinutes(target, now);
      if (mins < 60) setCountdown(`in ${mins}m`);
      else if (mins < 1440) setCountdown(`in ${Math.floor(mins / 60)}h ${mins % 60}m`);
      else setCountdown(`in ${Math.floor(mins / 1440)}d`);
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [nextEvent?.start_time]);

  // Count remaining events today
  const remainingToday = useMemo(() => {
    const now = new Date();
    return events.filter(e => e.start_time && !e.all_day && isAfter(parseISO(e.start_time), now)).length;
  }, [events]);

  // Next working day's meeting count (if no meetings today)
  const nextDayInfo = useMemo(() => {
    if (events.filter(e => !e.all_day).length > 0) return null;
    if (!nextWeekEvent?.start_time) return null;
    const nextDay = parseISO(nextWeekEvent.start_time);
    const dayEvents = weekEvents.filter(e => {
      if (!e.start_time || e.all_day) return false;
      const d = parseISO(e.start_time);
      return d.toDateString() === nextDay.toDateString();
    });
    return { day: format(nextDay, 'EEEE'), count: dayEvents.length };
  }, [events, nextWeekEvent, weekEvents]);

  return (
    <div className="card-premium p-4 md:p-6">
      {/* Calendar disconnected — clean reconnect card instead of raw error */}
      {calendarError && (
        <div className="mb-4 p-4 rounded-xl bg-[#0a1628]/60 border border-[#d4af37]/20 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#d4af37]/10 flex items-center justify-center flex-shrink-0">
            <Calendar className="h-5 w-5 text-[#d4af37]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium">
              {calendarError.type === 'token_expired' || calendarError.type === 'invalid_credentials'
                ? 'Calendar disconnected'
                : calendarError.type === 'network_error'
                ? 'Calendar temporarily unavailable'
                : 'Calendar sync issue'}
            </p>
            <p className="text-xs text-[#64748b] mt-0.5">
              {calendarError.type === 'token_expired' || calendarError.type === 'invalid_credentials'
                ? 'Google Calendar needs to be reconnected. Other briefing data is still available.'
                : calendarError.type === 'network_error'
                ? 'Unable to reach Google Calendar. Will retry automatically.'
                : calendarError.message}
            </p>
          </div>
          {calendarError.type === 'network_error' ? (
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2d3a52] text-white text-xs font-medium hover:bg-[#3d4a62] transition-colors flex-shrink-0"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Retry
            </button>
          ) : (
            <button
              onClick={() => window.location.href = '/admin?reconnect=calendar'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/30 text-[#d4af37] text-xs font-medium hover:bg-[#d4af37]/25 transition-colors flex-shrink-0"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Reconnect
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left: Stats */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-[#94a3b8] uppercase tracking-wider flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {dayLabel} at a Glance
          </h3>
          <div>
            <p className="stat-number">{stats.total_events}</p>
            <p className="text-[#64748b] text-sm mt-0.5">
              meeting{stats.total_events !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-baseline gap-4">
            <div>
              <p className="text-xl font-semibold text-[#d4af37]">{stats.total_hours}h</p>
              <p className="text-xs text-[#64748b]">booked</p>
            </div>
            <div>
              <p className="text-xl font-semibold text-emerald-400">{stats.free_hours}h</p>
              <p className="text-xs text-[#64748b]">free</p>
            </div>
          </div>
        </div>

        {/* Center: Next meeting with countdown */}
        <div className="flex flex-col items-center justify-center">
          {nextEvent ? (
            <button
              onClick={() => onEventClick?.(nextEvent)}
              className="w-full p-4 rounded-xl bg-[#0a1628]/50 border border-[#d4af37]/20 hover:border-[#d4af37]/40 transition-all text-left"
            >
              <p className="text-xs text-[#d4af37] uppercase tracking-wider font-medium mb-2">Next Meeting</p>
              <p className="text-sm font-semibold text-white truncate">{nextEvent.title}</p>
              {nextEvent.start_time && (
                <>
                  <p className="text-xs text-[#94a3b8] mt-1">
                    {format(parseISO(nextEvent.start_time), 'h:mm a')}
                    {nextEvent.end_time && ` – ${format(parseISO(nextEvent.end_time), 'h:mm a')}`}
                  </p>
                  {countdown && (
                    <p className="text-lg font-bold text-[#d4af37] mt-2">{countdown}</p>
                  )}
                </>
              )}
              {nextEvent.location && (
                <p className="text-xs text-[#64748b] mt-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />{nextEvent.location}
                </p>
              )}
              {nextVideoLink && onJoinNextCall && (
                <button
                  onClick={(e) => { e.stopPropagation(); onJoinNextCall(nextVideoLink); }}
                  className="btn-gold text-xs py-1.5 px-4 mt-3 w-full flex items-center justify-center gap-1.5"
                >
                  <Video className="h-3.5 w-3.5" />
                  Join Call
                </button>
              )}
            </button>
          ) : nextWeekEvent ? (
            <button
              onClick={() => onEventClick?.(nextWeekEvent)}
              className="w-full p-4 rounded-xl bg-[#0a1628]/50 border border-[#2d3a52] hover:border-[#2d3a52]/80 transition-all text-left"
            >
              <p className="text-xs text-[#64748b] uppercase tracking-wider mb-2">No meetings {isToday ? 'today' : dayLabel}</p>
              <p className="text-xs text-[#94a3b8] mt-2">Next meeting:</p>
              <p className="text-sm font-medium text-white truncate mt-0.5">{nextWeekEvent.title}</p>
              {nextWeekEvent.start_time && (
                <p className="text-xs text-[#d4af37] mt-1">
                  {format(parseISO(nextWeekEvent.start_time), 'EEEE')} at {format(parseISO(nextWeekEvent.start_time), 'h:mm a')}
                </p>
              )}
            </button>
          ) : (
            <div className="text-center p-4">
              <Clock className="h-8 w-8 text-[#4a5568] mx-auto mb-2" />
              <p className="text-xs text-[#64748b]">No meetings scheduled</p>
              <p className="text-lg font-semibold text-emerald-400 mt-1">All clear</p>
            </div>
          )}
        </div>

        {/* Right: Remaining or next day info + new event */}
        <div className="flex flex-col justify-between gap-3">
          {events.filter(e => !e.all_day).length > 0 ? (
            <div className="p-4 rounded-xl bg-[#0a1628]/50 border border-[#2d3a52]">
              <p className="text-xs text-[#64748b] uppercase tracking-wider mb-1">Remaining {isToday ? 'Today' : dayLabel}</p>
              <p className="text-2xl font-bold text-white">{remainingToday}</p>
              <p className="text-xs text-[#64748b] mt-0.5">
                meeting{remainingToday !== 1 ? 's' : ''} left
              </p>
            </div>
          ) : nextDayInfo ? (
            <div className="p-4 rounded-xl bg-[#0a1628]/50 border border-[#2d3a52]">
              <p className="text-xs text-[#64748b] uppercase tracking-wider mb-1">{nextDayInfo.day}</p>
              <p className="text-2xl font-bold text-white">{nextDayInfo.count}</p>
              <p className="text-xs text-[#64748b] mt-0.5">
                meeting{nextDayInfo.count !== 1 ? 's' : ''}
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#0a1628]/50 border border-[#2d3a52]">
              <p className="text-xs text-[#64748b]">No upcoming meetings</p>
            </div>
          )}

          {onNewEvent && (
            <button
              onClick={onNewEvent}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#d4af37]/10 border border-[#d4af37]/20 text-[#d4af37] text-xs font-medium hover:bg-[#d4af37]/20 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New Event
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
