'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Loader2,
  Clock,
  MapPin
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

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isNewEvent, setIsNewEvent] = useState(false);

  // Fetch events for current month
  const fetchEvents = useCallback(async () => {
    try {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const res = await fetch(`/api/calendar?year=${year}&month=${month}`);
      const data = await res.json();
      if (data.events) {
        setEvents(data.events);
      }
    } catch (error) {
      console.error('Failed to fetch events:', error);
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
    const endpoint = isNewEvent
      ? '/api/calendar'
      : `/api/calendar/${selectedEvent?.google_id}`;
    const method = isNewEvent ? 'POST' : 'PATCH';

    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      fetchEvents();
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const res = await fetch(`/api/calendar/${eventId}`, { method: 'DELETE' });
    if (res.ok) {
      setEvents((prev) => prev.filter((e) => e.google_id !== eventId));
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-white">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#1a2744] transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1.5 rounded-lg text-sm text-[#94a3b8] hover:text-white hover:bg-[#1a2744] transition-colors"
            >
              Today
            </button>
            <button
              onClick={handleNextMonth}
              className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#1a2744] transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSyncing(true);
              fetchEvents();
            }}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] text-[#94a3b8] hover:border-[#3d4a62] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </button>
          <button
            onClick={handleNewEvent}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0a1628] font-medium hover:bg-[#c9a432] transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Event
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 text-[#d4af37] animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-[#2d3a52] overflow-hidden">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 bg-[#1a2744]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                className="px-2 py-3 text-center text-sm font-medium text-[#64748b] border-b border-[#2d3a52]"
              >
                {day}
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
                  className={`min-h-[120px] p-2 border-b border-r border-[#2d3a52] cursor-pointer transition-colors hover:bg-[#1a2744]/50 ${
                    !isCurrentMonth ? 'bg-[#0a1628]/50' : 'bg-[#0f1d32]'
                  } ${index % 7 === 6 ? 'border-r-0' : ''}`}
                >
                  {/* Day Number */}
                  <div className="flex justify-end mb-1">
                    <span
                      className={`w-7 h-7 flex items-center justify-center rounded-full text-sm ${
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
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <div
                        key={event.google_id}
                        onClick={(e) => handleEventClick(event, e)}
                        className="group px-2 py-1 rounded text-xs truncate bg-[#d4af37]/20 text-[#d4af37] hover:bg-[#d4af37]/30 transition-colors cursor-pointer"
                      >
                        <span className="font-medium">{formatEventTime(event)}</span>
                        <span className="ml-1">{event.title}</span>
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="px-2 text-xs text-[#64748b]">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming Events Sidebar */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold text-white mb-3">Upcoming Events</h3>
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
