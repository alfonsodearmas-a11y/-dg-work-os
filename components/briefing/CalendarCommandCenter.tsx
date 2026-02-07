'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Plus, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { CalendarEvent } from '@/lib/calendar-types';
import { detectConflicts } from '@/lib/calendar-utils';
import { isSameDay, startOfDay, isToday as isTodayFn, format } from 'date-fns';
import { DayAtGlance } from './DayAtGlance';
import { TimelineView } from './TimelineView';
import { UpcomingThisWeek } from './UpcomingThisWeek';
import { WeekStrip } from './WeekStrip';
import { EventDetailPopover } from './EventDetailPopover';
import { EventModal, EventFormData } from '@/components/calendar/EventModal';

interface CalendarCommandCenterProps {
  todayEvents: CalendarEvent[];
  weekEvents: CalendarEvent[];
  onRefresh: () => void;
  calendarError?: { type: string; message: string } | null;
}

export function CalendarCommandCenter({ todayEvents, weekEvents, onRefresh, calendarError }: CalendarCommandCenterProps) {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, message });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  // Events for the focused day (selected or today)
  const isViewingToday = !selectedDay || isTodayFn(selectedDay);
  const focusedDayEvents = useMemo(() => {
    if (isViewingToday) return todayEvents;
    return weekEvents.filter(
      (e) => e.start_time && isSameDay(startOfDay(new Date(e.start_time)), selectedDay!)
    );
  }, [isViewingToday, selectedDay, weekEvents, todayEvents]);

  const focusedDayLabel = isViewingToday
    ? 'Today'
    : format(selectedDay!, 'EEEE');

  const conflicts = useMemo(() => detectConflicts(focusedDayEvents), [focusedDayEvents]);
  const hasConflicts = conflicts.size > 0;

  const conflictCount = useMemo(() => {
    const pairs = new Set<string>();
    conflicts.forEach((others, id) => {
      others.forEach(o => {
        const key = [id, o.google_id].sort().join('-');
        pairs.add(key);
      });
    });
    return pairs.size;
  }, [conflicts]);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
  }, []);

  const handleEdit = useCallback((event: CalendarEvent) => {
    setSelectedEvent(null);
    setEditingEvent(event);
  }, []);

  const handleDelete = useCallback(async (eventId: string) => {
    if (!confirm('Delete this event? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/calendar/${eventId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed');
      }
      setSelectedEvent(null);
      showToast('success', 'Event deleted');
      onRefresh();
    } catch (err) {
      console.error('Failed to delete event:', err);
      showToast('error', err instanceof Error ? err.message : 'Failed to delete event');
      throw err;
    }
  }, [onRefresh, showToast]);

  const handleSave = useCallback(async (data: EventFormData) => {
    try {
      if (editingEvent) {
        const res = await fetch(`/api/calendar/${editingEvent.google_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData._errorMessage || errData.error || 'Update failed');
        }
        showToast('success', 'Event updated');
      } else {
        const res = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData._errorMessage || errData.error || 'Create failed');
        }
        showToast('success', 'Event created');
      }
      onRefresh();
    } catch (err) {
      console.error('Failed to save event:', err);
      showToast('error', err instanceof Error ? err.message : 'Failed to save event');
      throw err;
    }
  }, [editingEvent, onRefresh, showToast]);

  const handleJoinCall = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const handleNewEvent = useCallback(() => {
    setEditingEvent(null);
    setIsCreating(true);
  }, []);

  const handleDayClick = useCallback((date: Date) => {
    setSelectedDay(prev => {
      if (prev && prev.toDateString() === date.toDateString()) return null;
      return date;
    });
  }, []);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Day at a Glance */}
      <DayAtGlance
        events={focusedDayEvents}
        weekEvents={weekEvents}
        onJoinNextCall={handleJoinCall}
        onNewEvent={handleNewEvent}
        onEventClick={handleEventClick}
        calendarError={calendarError}
        dayLabel={focusedDayLabel}
        isToday={isViewingToday}
      />

      {/* Week Strip */}
      <WeekStrip
        weekEvents={weekEvents}
        todayEvents={todayEvents}
        onDayClick={handleDayClick}
        selectedDay={selectedDay}
      />

      {/* Conflict Banner */}
      {hasConflicts && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">
            {conflictCount} scheduling conflict{conflictCount > 1 ? 's' : ''} detected today
          </p>
        </div>
      )}

      {/* Main Layout: Timeline + Upcoming This Week */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Timeline (2 cols) */}
        <div className="lg:col-span-2">
          <div className="card-premium p-3 md:p-4" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-[#94a3b8] uppercase tracking-wider">
                {isViewingToday ? 'Timeline' : `${focusedDayLabel}\u2019s Timeline`}
              </h3>
              <button
                onClick={handleNewEvent}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d4af37] text-[#0a1628] text-xs font-medium hover:bg-[#c9a432] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                New Event
              </button>
            </div>
            <TimelineView events={focusedDayEvents} onEventClick={handleEventClick} selectedDate={selectedDay} />
          </div>
        </div>

        {/* Upcoming This Week (1 col) */}
        <div>
          <div className="card-premium p-3 md:p-4">
            <UpcomingThisWeek
              weekEvents={weekEvents}
              onEventClick={handleEventClick}
              selectedDay={selectedDay}
            />
          </div>
        </div>
      </div>

      {/* Event Detail Popover */}
      {selectedEvent && (
        <EventDetailPopover
          event={selectedEvent}
          conflictingEvents={conflicts.get(selectedEvent.google_id)}
          onClose={() => setSelectedEvent(null)}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onJoinCall={handleJoinCall}
        />
      )}

      {/* Event Modal (Create/Edit) */}
      <EventModal
        event={editingEvent}
        isOpen={isCreating || !!editingEvent}
        isNew={isCreating}
        defaultDate={new Date()}
        enableQuickCreate={true}
        onClose={() => { setIsCreating(false); setEditingEvent(null); }}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border transition-all animate-fade-in ${
          toast.type === 'success'
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/15 border-red-500/30 text-red-400'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            : <XCircle className="h-4 w-4 flex-shrink-0" />
          }
          <span className="text-sm">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100">
            <span className="sr-only">Dismiss</span>&times;
          </button>
        </div>
      )}
    </div>
  );
}
