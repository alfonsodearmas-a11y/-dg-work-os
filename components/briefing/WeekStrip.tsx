'use client';

import { useMemo } from 'react';
import { CalendarEvent, detectEventCategory, EventCategory } from '@/lib/calendar-types';
import { calculateDayStats } from '@/lib/calendar-utils';
import { format, startOfDay, addDays, isSameDay, isToday as isTodayFn } from 'date-fns';

interface WeekStripProps {
  weekEvents: CalendarEvent[];
  todayEvents: CalendarEvent[];
  onDayClick: (date: Date) => void;
  selectedDay: Date | null;
}

const DOT_COLORS: Record<EventCategory, string> = {
  ministry: 'bg-navy-700',
  board: 'bg-gold-500',
  external: 'bg-teal-500',
  personal: 'bg-navy-600',
  blocked: 'bg-navy-800',
};

export function WeekStrip({ weekEvents, todayEvents, onDayClick, selectedDay }: WeekStripProps) {
  const today = startOfDay(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  // Group events by day
  const eventsByDay = (date: Date): CalendarEvent[] =>
    weekEvents.filter(
      (e) => e.start_time && isSameDay(startOfDay(new Date(e.start_time)), date)
    );

  // Week summary stats
  const weekStats = calculateDayStats(weekEvents);

  // Stats for the focused day (selected or today)
  const focusedDayEvents = useMemo(() => {
    if (!selectedDay) return todayEvents;
    return weekEvents.filter(
      (e) => e.start_time && isSameDay(startOfDay(new Date(e.start_time)), selectedDay)
    );
  }, [selectedDay, weekEvents, todayEvents]);
  const focusedStats = calculateDayStats(focusedDayEvents);
  const focusedLabel = selectedDay && !isTodayFn(selectedDay)
    ? format(selectedDay, 'EEE')
    : 'today';

  return (
    <div className="card-premium p-3 md:p-4">
      {/* Day strip */}
      <div className="flex gap-1 md:gap-2">
        {days.map((day) => {
          const isToday = isTodayFn(day);
          const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
          const dayEvents = eventsByDay(day);

          // Get category for each event dot (max 3 shown)
          const dotCategories = dayEvents
            .slice(0, 3)
            .map((e) => detectEventCategory(e));
          const overflow = dayEvents.length - 3;

          // Styling: selected gets gold, today (unselected) gets subtle gold, others default
          let cellClass: string;
          if (isSelected) {
            cellClass = 'bg-gold-500/20 border border-gold-500/60 shadow-[0_0_8px_rgba(212,175,55,0.15)]';
          } else if (isToday) {
            cellClass = selectedDay
              ? 'bg-gold-500/8 border border-gold-500/20'
              : 'bg-gold-500/20 border border-gold-500/40';
          } else {
            cellClass = 'border border-transparent hover:bg-navy-900/50';
          }

          return (
            <button
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={`flex-1 min-w-0 flex flex-col items-center p-1.5 md:p-2 rounded-xl transition-all cursor-pointer select-none active:scale-95 ${cellClass}`}
            >
              {/* Day name */}
              <span
                className={`text-xs font-medium ${
                  isSelected ? 'text-gold-500' : isToday ? 'text-gold-500/70' : 'text-navy-600'
                }`}
              >
                {format(day, 'EEE')}
              </span>

              {/* Day number */}
              <span
                className={`text-sm md:text-base font-bold ${
                  isSelected ? 'text-gold-500' : isToday ? 'text-gold-500/70' : 'text-white'
                }`}
              >
                {format(day, 'd')}
              </span>

              {/* Event dots */}
              <div className="flex items-center gap-0.5 mt-1 min-h-[8px]">
                {dayEvents.length > 0 ? (
                  <>
                    {dotCategories.map((category, idx) => (
                      <span
                        key={idx}
                        className={`w-1.5 h-1.5 rounded-full ${DOT_COLORS[category]}`}
                      />
                    ))}
                    {overflow > 0 && (
                      <span className="text-[8px] text-navy-600 ml-0.5">
                        +{overflow}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="min-h-[6px]" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Summary line */}
      <p className="text-xs text-navy-600 mt-3 text-center">
        {weekStats.total_events} meeting{weekStats.total_events !== 1 ? 's' : ''} this week
        {' '}&middot; {weekStats.total_hours}h total
        {' '}&middot; {focusedStats.free_hours}h free {focusedLabel}
      </p>
    </div>
  );
}
