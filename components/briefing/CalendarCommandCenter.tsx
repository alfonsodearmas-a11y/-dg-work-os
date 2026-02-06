'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import { CalendarEvent } from '@/lib/calendar-types';
import { detectConflicts } from '@/lib/calendar-utils';
import { DayAtGlance } from './DayAtGlance';
import { TimelineView } from './TimelineView';
import { MeetingPrepCard } from './MeetingPrepCard';
import { EventDetailPopover } from './EventDetailPopover';
import { EventModal, EventFormData } from '@/components/calendar/EventModal';

interface CalendarCommandCenterProps {
  todayEvents: CalendarEvent[];
  weekEvents: CalendarEvent[];
  onRefresh: () => void;
}

export function CalendarCommandCenter({ todayEvents, weekEvents, onRefresh }: CalendarCommandCenterProps) {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const conflicts = useMemo(() => detectConflicts(todayEvents), [todayEvents]);
  const hasConflicts = conflicts.size > 0;

  // Unique conflicting event pairs for the banner
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
      if (!res.ok) throw new Error('Delete failed');
      setSelectedEvent(null);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  }, [onRefresh]);

  const handleSave = useCallback(async (data: EventFormData) => {
    try {
      if (editingEvent) {
        // Update
        const res = await fetch(`/api/calendar/${editingEvent.google_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Update failed');
      } else {
        // Create
        const res = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Create failed');
      }
      onRefresh();
    } catch (err) {
      console.error('Failed to save event:', err);
    }
  }, [editingEvent, onRefresh]);

  const handleJoinCall = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <div className="space-y-6">
      {/* Day at a Glance */}
      <DayAtGlance
        events={todayEvents}
        weekEvents={weekEvents}
        onJoinNextCall={handleJoinCall}
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

      {/* Main Layout: Timeline + Meeting Prep */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline (2 cols) */}
        <div className="lg:col-span-2">
          <div className="card-premium p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-[#94a3b8] uppercase tracking-wider">Timeline</h3>
              <button
                onClick={() => { setEditingEvent(null); setIsCreating(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d4af37] text-[#0a1628] text-xs font-medium hover:bg-[#c9a432] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                New Event
              </button>
            </div>
            <TimelineView events={todayEvents} onEventClick={handleEventClick} />
          </div>
        </div>

        {/* Meeting Prep (1 col) */}
        <div>
          <div className="card-premium p-4">
            <MeetingPrepCard events={todayEvents} onJoinCall={handleJoinCall} />
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
    </div>
  );
}
