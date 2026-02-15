'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Loader2,
  Clock,
  MapPin,
  AlertTriangle,
  RefreshCcw,
  Calendar
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
  addMonths,
  subMonths
} from 'date-fns';
import { CalendarEvent } from '@/lib/calendar-types';
import { EventModal, EventFormData } from './EventModal';

export function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarDisconnected, setCalendarDisconnected] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isNewEvent, setIsNewEvent] = useState(false);

  // Fetch events for current month with error/disconnected state tracking
  const fetchEvents = useCallback(async () => {
    try {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const res = await fetch(`/api/calendar?year=${year}&month=${month}`);
      const data = await res.json();
      if (data._errorType === 'token_expired' || data._errorType === 'invalid_credentials') {
        setCalendarDisconnected(true);
        setEvents([]);
      } else {
        setCalendarDisconnected(false);
        setError(null);
        if (data.events) {
          setEvents(data.events);
        }
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
      setError('Failed to load calendar events');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    setLoading(true);
    fetchEvents();
  }, [fetchEvents]);

  // Calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Get events for a specific day
  const getEventsForDay = (day: Date): CalendarEvent[] => {
    return events.filter((event) => {
      if (!event.start_time) return false;
      const eventDate = parseISO(event.start_time);
      return isSameDay(eventDate, day);
    });
  };

  // Handlers
  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const handleToday = () => setCurrentMonth(new Date());

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    setSelectedEvent(null);
    setIsNewEvent(true);
    setModalOpen(true);
  };

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedEvent(event);
    setSelectedDate(null);
    setIsNewEvent(false);
    setModalOpen(true);
  };

  const handleNewEvent = () => {
    setSelectedDate(new Date());
    setSelectedEvent(null);
    setIsNewEvent(true);
    setModalOpen(true);
  };

  const handleSaveEvent = async (data: EventFormData) => {
    try {
      const endpoint = isNewEvent
        ? '/api/calendar'
        : `/api/calendar/${selectedEvent?.google_id}`;
      const method = isNewEvent ? 'POST' : 'PATCH';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData._errorMessage || errData.error || `Save failed (${res.status})`);
      }
      fetchEvents();
    } catch (err) {
      console.error('Failed to save event:', err);
      throw err; // Re-throw so the modal can display the error
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      const res = await fetch(`/api/calendar/${eventId}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData._errorMessage || errData.error || 'Delete failed');
      }
      setEvents((prev) => prev.filter((e) => e.google_id !== eventId));
    } catch (err) {
      console.error('Failed to delete event:', err);
      throw err;
    }
  };

  const formatEventTime = (event: CalendarEvent) => {
    if (event.all_day || !event.start_time) return 'All day';
    try {
      return format(parseISO(event.start_time), 'h:mm a');
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <h2 className="text-lg md:text-2xl font-bold text-white truncate">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <div className="flex items-center gap-0.5 md:gap-1 shrink-0">
            <button
              onClick={handlePrevMonth}
              className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#1a2744] transition-colors touch-active"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={handleToday}
              className="px-2 md:px-3 py-1.5 rounded-lg text-xs md:text-sm text-[#94a3b8] hover:text-white hover:bg-[#1a2744] transition-colors touch-active"
            >
              Today
            </button>
            <button
              onClick={handleNextMonth}
              className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#1a2744] transition-colors touch-active"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setSyncing(true);
              fetchEvents();
            }}
            disabled={syncing}
            className="flex items-center gap-2 p-2 md:px-3 md:py-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] text-[#94a3b8] hover:border-[#3d4a62] transition-colors disabled:opacity-50 touch-active"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">Sync</span>
          </button>
          <button
            onClick={handleNewEvent}
            className="flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 rounded-lg bg-[#d4af37] text-[#0a1628] font-medium hover:bg-[#c9a432] transition-colors touch-active"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden md:inline">New Event</span>
          </button>
        </div>
      </div>

      {/* Calendar disconnected banner */}
      {calendarDisconnected && (
        <div className="p-4 rounded-xl bg-[#0a1628]/60 border border-[#d4af37]/20 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#d4af37]/10 flex items-center justify-center flex-shrink-0">
            <Calendar className="h-5 w-5 text-[#d4af37]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium">Calendar disconnected</p>
            <p className="text-xs text-[#64748b] mt-0.5">Google Calendar needs to be reconnected.</p>
          </div>
          <button
            onClick={() => window.location.href = '/admin?reconnect=calendar'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/30 text-[#d4af37] text-xs font-medium hover:bg-[#d4af37]/25 transition-colors flex-shrink-0"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Reconnect
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && !calendarDisconnected && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchEvents} className="ml-auto text-xs text-red-400 hover:text-red-300">Retry</button>
        </div>
      )}

      {/* Calendar Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 text-[#d4af37] animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-[#2d3a52] overflow-hidden">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 bg-[#1a2744]">
            {[
              { short: 'S', full: 'Sun' },
              { short: 'M', full: 'Mon' },
              { short: 'T', full: 'Tue' },
              { short: 'W', full: 'Wed' },
              { short: 'T', full: 'Thu' },
              { short: 'F', full: 'Fri' },
              { short: 'S', full: 'Sat' },
            ].map((day, i) => (
              <div
                key={i}
                className="px-1 md:px-2 py-2 md:py-3 text-center text-xs md:text-sm font-medium text-[#64748b] border-b border-[#2d3a52]"
              >
                <span className="md:hidden">{day.short}</span>
                <span className="hidden md:inline">{day.full}</span>
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7">
            {days.map((day, index) => {
              const dayEvents = getEventsForDay(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isCurrentDay = isToday(day);

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => handleDayClick(day)}
                  className={`min-h-[72px] md:min-h-[120px] p-1 md:p-2 border-b border-r border-[#2d3a52] cursor-pointer transition-colors hover:bg-[#1a2744]/50 touch-active ${
                    !isCurrentMonth ? 'bg-[#0a1628]/50' : 'bg-[#0f1d32]'
                  } ${index % 7 === 6 ? 'border-r-0' : ''}`}
                >
                  {/* Day Number */}
                  <div className="flex justify-end mb-0.5 md:mb-1">
                    <span
                      className={`w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-full text-xs md:text-sm ${
                        isCurrentDay
                          ? 'bg-[#d4af37] text-[#0a1628] font-bold'
                          : isCurrentMonth
                          ? 'text-white'
                          : 'text-[#64748b]'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>

                  {/* Events */}
                  <div className="space-y-0.5 md:space-y-1">
                    {dayEvents.slice(0, 2).map((event) => (
                      <div
                        key={event.google_id}
                        onClick={(e) => handleEventClick(event, e)}
                        className="group px-1 md:px-2 py-0.5 md:py-1 rounded text-[10px] md:text-xs truncate bg-[#d4af37]/20 text-[#d4af37] hover:bg-[#d4af37]/30 transition-colors cursor-pointer"
                      >
                        <span className="font-medium hidden md:inline">{formatEventTime(event)}</span>
                        <span className="md:ml-1">{event.title}</span>
                      </div>
                    ))}
                    {/* Show 3rd event on desktop only */}
                    {dayEvents.length > 2 && (
                      <>
                        {dayEvents[2] && (
                          <div
                            key={dayEvents[2].google_id}
                            onClick={(e) => handleEventClick(dayEvents[2], e)}
                            className="hidden md:block group px-2 py-1 rounded text-xs truncate bg-[#d4af37]/20 text-[#d4af37] hover:bg-[#d4af37]/30 transition-colors cursor-pointer"
                          >
                            <span className="font-medium">{formatEventTime(dayEvents[2])}</span>
                            <span className="ml-1">{dayEvents[2].title}</span>
                          </div>
                        )}
                        <div className={`px-1 md:px-2 text-[10px] md:text-xs text-[#64748b] ${dayEvents.length > 3 ? '' : 'md:hidden'}`}>
                          +{dayEvents.length - 2} more
                        </div>
                        {dayEvents.length > 3 && (
                          <div className="hidden md:block px-2 text-xs text-[#64748b]">
                            +{dayEvents.length - 3} more
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming Events Sidebar */}
      <div className="mt-4 md:mt-6">
        <h3 className="text-base md:text-lg font-semibold text-white mb-2 md:mb-3">Upcoming Events</h3>
        <div className="space-y-2">
          {events
            .filter((e) => e.start_time && parseISO(e.start_time) >= new Date())
            .slice(0, 5)
            .map((event) => (
              <div
                key={event.google_id}
                onClick={(e) => handleEventClick(event, e)}
                className="p-3 rounded-xl bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37]/50 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-white font-medium">{event.title}</h4>
                    <div className="flex items-center gap-3 mt-1 text-sm text-[#64748b]">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {event.start_time &&
                          format(parseISO(event.start_time), 'MMM d, h:mm a')}
                      </span>
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {event.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          {events.filter((e) => e.start_time && parseISO(e.start_time) >= new Date())
            .length === 0 && (
            <p className="text-[#64748b] text-sm">No upcoming events</p>
          )}
        </div>
      </div>

      {/* Event Modal */}
      <EventModal
        event={selectedEvent}
        isOpen={modalOpen}
        isNew={isNewEvent}
        defaultDate={selectedDate || undefined}
        onClose={() => {
          setModalOpen(false);
          setSelectedEvent(null);
          setSelectedDate(null);
        }}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
      />
    </div>
  );
}
