'use client';

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
  ministry: 'bg-[#4a5568]',
  board: 'bg-[#d4af37]',
  external: 'bg-teal-500',
  personal: 'bg-[#64748b]',
  blocked: 'bg-[#2d3a52]',
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
  const todayStats = calculateDayStats(todayEvents);

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

          return (
            <button
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={`flex-1 min-w-0 flex flex-col items-center p-1.5 md:p-2 rounded-xl transition-all ${
                isToday
                  ? 'bg-[#d4af37]/20 border border-[#d4af37]/40'
                  : isSelected
                    ? 'bg-[#1a2744] border border-[#2d3a52]'
                    : 'hover:bg-[#1a2744]/50'
              }`}
            >
              {/* Day name */}
              <span
                className={`text-[10px] md:text-xs font-medium ${
                  isToday ? 'text-[#d4af37]' : 'text-[#64748b]'
                }`}
              >
                {format(day, 'EEE')}
              </span>

              {/* Day number */}
              <span
                className={`text-sm md:text-base font-bold ${
                  isToday ? 'text-[#d4af37]' : 'text-white'
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
                      <span className="text-[8px] text-[#64748b] ml-0.5">
                        +{overflow}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[8px] text-[#2d3a52]">--</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Summary line */}
      <p className="text-xs text-[#64748b] mt-3 text-center">
        {weekStats.total_events} meeting{weekStats.total_events !== 1 ? 's' : ''} this week
        {' '}&middot; {weekStats.total_hours}h total
        {' '}&middot; {todayStats.free_hours}h free today
      </p>
    </div>
  );
}
