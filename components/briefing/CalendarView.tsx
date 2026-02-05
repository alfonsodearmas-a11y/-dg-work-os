'use client';

import { format, parseISO } from 'date-fns';
import { MapPin } from 'lucide-react';

interface CalendarEvent {
  google_id: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
}

interface CalendarViewProps {
  events: CalendarEvent[];
  showDate?: boolean;
}

export function CalendarView({ events, showDate }: CalendarViewProps) {
  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div
          key={event.google_id}
          className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50"
        >
          <div className="flex-shrink-0 text-center min-w-[60px]">
            {event.start_time && (
              <>
                {showDate && (
                  <p className="text-xs text-gray-500">
                    {format(parseISO(event.start_time), 'MMM d')}
                  </p>
                )}
                <p className="text-sm font-medium">
                  {format(parseISO(event.start_time), 'HH:mm')}
                </p>
              </>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">
              {event.title}
            </p>
            {event.location && (
              <p className="text-xs text-gray-500 flex items-center mt-1">
                <MapPin className="h-3 w-3 mr-1" />
                {event.location}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
