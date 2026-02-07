'use client';

import { useMemo } from 'react';
import { format, parseISO, startOfDay, addDays, isSameDay, isToday } from 'date-fns';
import { Video, Clock, Calendar } from 'lucide-react';
import { CalendarEvent, detectEventCategory, EventCategory } from '@/lib/calendar-types';
import { formatDuration, getEventDurationMinutes, getVideoLink } from '@/lib/calendar-utils';

interface UpcomingThisWeekProps {
  weekEvents: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  selectedDay?: Date | null;
}

const CATEGORY_DOT_COLORS: Record<EventCategory, string> = {
  ministry: 'bg-[#4a5568]',
  board: 'bg-[#d4af37]',
  external: 'bg-teal-500',
  personal: 'bg-[#64748b]',
  blocked: 'bg-[#2d3a52]',
};

interface DayGroup {
  date: Date;
  events: CalendarEvent[];
}

export function UpcomingThisWeek({ weekEvents, onEventClick, selectedDay }: UpcomingThisWeekProps) {
  const dayGroups = useMemo(() => {
    const today = startOfDay(new Date());
    const groups: DayGroup[] = [];

    for (let i = 0; i < 7; i++) {
      const day = addDays(today, i);

      // If selectedDay is set and this day doesn't match, skip it
      if (selectedDay && !isSameDay(day, selectedDay)) {
        continue;
      }

      const dayEvents = weekEvents
        .filter((event) => {
          if (!event.start_time) return false;
          return isSameDay(parseISO(event.start_time), day);
        })
        .sort((a, b) => {
          // All-day events first, then by start time
          if (a.all_day && !b.all_day) return -1;
          if (!a.all_day && b.all_day) return 1;
          if (!a.start_time || !b.start_time) return 0;
          return parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime();
        });

      groups.push({ date: day, events: dayEvents });
    }

    return groups;
  }, [weekEvents, selectedDay]);

  return (
    <div className="overflow-y-auto max-h-[500px]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="h-4 w-4 text-[#94a3b8]" />
        <span className="text-sm font-medium text-[#94a3b8] uppercase tracking-wider">
          Upcoming This Week
        </span>
      </div>

      {/* Day groups */}
      <div className="space-y-4">
        {dayGroups.map((group) => {
          const dayIsToday = isToday(group.date);
          const dayLabel = dayIsToday
            ? `Today, ${format(group.date, 'MMM d')}`
            : format(group.date, 'EEEE, MMM d');

          return (
            <div key={group.date.toISOString()}>
              {/* Day header */}
              <h3
                className={`text-sm font-bold mb-2 ${
                  dayIsToday ? 'text-[#d4af37]' : 'text-white'
                }`}
              >
                {dayLabel}
              </h3>

              {/* Events */}
              {group.events.length === 0 ? (
                <p className="text-[#64748b] italic text-xs pl-2">No events</p>
              ) : (
                <div className="space-y-1">
                  {group.events.map((event) => {
                    const category = detectEventCategory(event);
                    const durationMinutes = getEventDurationMinutes(event);
                    const durationLabel = durationMinutes > 0 ? formatDuration(durationMinutes) : null;
                    const videoLink = getVideoLink(event);
                    const timeLabel = event.all_day
                      ? 'All day'
                      : event.start_time
                        ? format(parseISO(event.start_time), 'h:mm a')
                        : '';

                    return (
                      <button
                        key={event.google_id}
                        onClick={() => onEventClick(event)}
                        className="w-full flex items-center gap-2 px-2 py-2 min-h-[44px] rounded-lg hover:bg-[#1a2744] transition-colors cursor-pointer text-left"
                      >
                        {/* Time */}
                        <span className="w-16 flex-shrink-0 text-xs font-bold text-[#94a3b8]">
                          {timeLabel}
                        </span>

                        {/* Category dot */}
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${CATEGORY_DOT_COLORS[category]}`}
                        />

                        {/* Title + duration */}
                        <span className="flex-1 min-w-0 flex items-center gap-1.5">
                          <span className="text-sm text-white truncate">{event.title}</span>
                          {durationLabel && (
                            <span className="text-xs text-[#64748b] flex-shrink-0">
                              ({durationLabel})
                            </span>
                          )}
                        </span>

                        {/* Video icon */}
                        {videoLink && (
                          <Video className="h-3 w-3 text-[#d4af37] flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
