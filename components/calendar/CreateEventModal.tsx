'use client';

import { useState, useRef, useEffect } from 'react';
import { EventModal, EventFormData } from './EventModal';
import { CalendarEvent } from '@/lib/calendar-types';
import { ExternalLink, CheckCircle2 } from 'lucide-react';

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTitle?: string;
  defaultDate?: string;       // ISO date string e.g. "2026-03-05"
  defaultAttendees?: string[];
}

export function CreateEventModal({
  isOpen,
  onClose,
  defaultTitle,
  defaultDate,
  defaultAttendees,
}: CreateEventModalProps) {
  const [createdEvent, setCreatedEvent] = useState<CalendarEvent | null>(null);

  const handleSave = async (data: EventFormData) => {
    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData._errorMessage || errData.error || `Failed to create event (${res.status})`);
    }

    const { event } = await res.json();
    setCreatedEvent(event);
  };

  const handleClose = () => {
    setCreatedEvent(null);
    onClose();
  };

  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  useEffect(() => {
    if (isOpen && createdEvent && successRef.current) {
      const focusable = successRef.current.querySelector<HTMLElement>('a, button, [tabindex]:not([tabindex="-1"])');
      focusable?.focus();
    }
  }, [isOpen, createdEvent]);

  if (!isOpen) return null;

  // Success state
  if (createdEvent) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/80" style={{ zIndex: -1 }} onClick={handleClose} aria-hidden="true" />
        <div ref={successRef} role="dialog" aria-modal="true" aria-labelledby="create-event-success-title" className="relative w-full max-w-sm bg-gradient-to-b from-[#1a2744] to-[#0f1d32] border border-[#2d3a52] rounded-2xl shadow-2xl p-6 text-center animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-7 w-7 text-emerald-400" />
          </div>
          <h3 id="create-event-success-title" className="text-white font-semibold text-lg mb-1">Event Created</h3>
          <p className="text-[#64748b] text-sm mb-4">
            &quot;{createdEvent.title}&quot; has been added to your Google Calendar.
          </p>
          <div className="flex flex-col gap-2">
            {createdEvent.html_link && (
              <a
                href={createdEvent.html_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0a1628] font-medium hover:bg-[#c9a432] transition-colors text-sm"
              >
                <ExternalLink className="h-4 w-4" />
                Open in Google Calendar
              </a>
            )}
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-lg text-[#94a3b8] hover:text-white hover:bg-[#2d3a52] transition-colors text-sm"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Build default date for EventModal
  let defaultDateObj: Date | undefined;
  if (defaultDate) {
    defaultDateObj = new Date(defaultDate + 'T09:00:00');
  }

  // Build a pre-filled event shell if we have defaults
  const prefilledEvent: CalendarEvent | null = (defaultTitle || defaultAttendees?.length)
    ? {
        google_id: '',
        title: defaultTitle || '',
        start_time: defaultDateObj ? `${defaultDate}T09:00` : null,
        end_time: defaultDateObj ? `${defaultDate}T10:00` : null,
        location: null,
        description: null,
        all_day: false,
        attendees: defaultAttendees?.map(email => ({ email })),
      }
    : null;

  return (
    <EventModal
      event={prefilledEvent}
      isOpen={isOpen}
      isNew
      defaultDate={defaultDateObj || new Date()}
      onClose={handleClose}
      onSave={handleSave}
    />
  );
}
