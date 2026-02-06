import { parseISO, differenceInMinutes, isWithinInterval, isAfter, isBefore, format } from 'date-fns';
import { CalendarEvent, detectEventCategory, EventCategory } from './calendar-types';

// --- Conflict Detection ---

export function detectConflicts(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const conflicts = new Map<string, CalendarEvent[]>();
  const timedEvents = events.filter(e => e.start_time && e.end_time && !e.all_day);

  for (let i = 0; i < timedEvents.length; i++) {
    for (let j = i + 1; j < timedEvents.length; j++) {
      const a = timedEvents[i];
      const b = timedEvents[j];
      const aStart = parseISO(a.start_time!);
      const aEnd = parseISO(a.end_time!);
      const bStart = parseISO(b.start_time!);
      const bEnd = parseISO(b.end_time!);

      // Overlap: A starts before B ends AND B starts before A ends
      if (isBefore(aStart, bEnd) && isBefore(bStart, aEnd)) {
        if (!conflicts.has(a.google_id)) conflicts.set(a.google_id, []);
        if (!conflicts.has(b.google_id)) conflicts.set(b.google_id, []);
        conflicts.get(a.google_id)!.push(b);
        conflicts.get(b.google_id)!.push(a);
      }
    }
  }

  return conflicts;
}

// --- Upcoming Events ---

export function getUpcomingEvents(events: CalendarEvent[], count: number): CalendarEvent[] {
  const now = new Date();
  return events
    .filter(e => e.start_time && isAfter(parseISO(e.start_time), now))
    .sort((a, b) => parseISO(a.start_time!).getTime() - parseISO(b.start_time!).getTime())
    .slice(0, count);
}

export function getNextEvent(events: CalendarEvent[]): CalendarEvent | null {
  const upcoming = getUpcomingEvents(events, 1);
  return upcoming[0] || null;
}

// --- Day Stats ---

export interface DayStats {
  total_events: number;
  total_hours: number;
  free_hours: number;
  hours_by_category: Record<EventCategory, number>;
  free_blocks: Array<{ start: string; end: string; duration_minutes: number }>;
}

export function calculateDayStats(events: CalendarEvent[]): DayStats {
  const timedEvents = events.filter(e => e.start_time && e.end_time && !e.all_day);

  let totalMinutes = 0;
  const categoryMinutes: Record<EventCategory, number> = {
    ministry: 0,
    board: 0,
    external: 0,
    personal: 0,
    blocked: 0,
  };

  for (const event of timedEvents) {
    const mins = differenceInMinutes(parseISO(event.end_time!), parseISO(event.start_time!));
    totalMinutes += mins;
    const category = detectEventCategory(event);
    categoryMinutes[category] += mins;
  }

  // Calculate free blocks between events (7am-8pm workday)
  const workdayStart = new Date();
  workdayStart.setHours(7, 0, 0, 0);
  const workdayEnd = new Date();
  workdayEnd.setHours(20, 0, 0, 0);
  const workdayMinutes = 13 * 60; // 7am-8pm

  const sorted = timedEvents
    .map(e => ({ start: parseISO(e.start_time!), end: parseISO(e.end_time!) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const freeBlocks: DayStats['free_blocks'] = [];
  let cursor = workdayStart;

  for (const slot of sorted) {
    const slotStart = slot.start < workdayStart ? workdayStart : slot.start;
    const slotEnd = slot.end > workdayEnd ? workdayEnd : slot.end;

    if (isAfter(slotStart, cursor)) {
      const gapMinutes = differenceInMinutes(slotStart, cursor);
      if (gapMinutes >= 15) {
        freeBlocks.push({
          start: cursor.toISOString(),
          end: slotStart.toISOString(),
          duration_minutes: gapMinutes,
        });
      }
    }
    if (isAfter(slotEnd, cursor)) {
      cursor = slotEnd;
    }
  }

  // Final free block until end of workday
  if (isBefore(cursor, workdayEnd)) {
    const gapMinutes = differenceInMinutes(workdayEnd, cursor);
    if (gapMinutes >= 15) {
      freeBlocks.push({
        start: cursor.toISOString(),
        end: workdayEnd.toISOString(),
        duration_minutes: gapMinutes,
      });
    }
  }

  const totalHours = totalMinutes / 60;
  const freeHours = Math.max(0, (workdayMinutes - totalMinutes) / 60);

  const hoursByCategory: Record<EventCategory, number> = {
    ministry: categoryMinutes.ministry / 60,
    board: categoryMinutes.board / 60,
    external: categoryMinutes.external / 60,
    personal: categoryMinutes.personal / 60,
    blocked: categoryMinutes.blocked / 60,
  };

  return {
    total_events: events.length,
    total_hours: Math.round(totalHours * 10) / 10,
    free_hours: Math.round(freeHours * 10) / 10,
    hours_by_category: hoursByCategory,
    free_blocks: freeBlocks,
  };
}

// --- Formatting ---

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// --- Video Link ---

export function getVideoLink(event: CalendarEvent): string | null {
  if (!event.conference_data) return null;
  const videoEntry = event.conference_data.entry_points.find(ep => ep.entry_point_type === 'video');
  return videoEntry?.uri || null;
}

// --- Currently Happening ---

export function isCurrentlyHappening(event: CalendarEvent): boolean {
  if (!event.start_time || !event.end_time || event.all_day) return false;
  const now = new Date();
  try {
    return isWithinInterval(now, { start: parseISO(event.start_time), end: parseISO(event.end_time) });
  } catch {
    return false;
  }
}

// --- Event Duration in Minutes ---

export function getEventDurationMinutes(event: CalendarEvent): number {
  if (!event.start_time || !event.end_time) return 0;
  return Math.max(0, differenceInMinutes(parseISO(event.end_time), parseISO(event.start_time)));
}
