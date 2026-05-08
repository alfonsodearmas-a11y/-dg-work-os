import { fetchTodayEvents } from '@/lib/google-calendar';
import { logger } from '@/lib/logger';

export interface ScheduleEvent {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
}

export interface CalendarToday {
  ok: boolean;
  events: ScheduleEvent[];
  nextEvent: ScheduleEvent | null;
}

export async function getCalendarToday(userId: string, now: Date = new Date()): Promise<CalendarToday> {
  try {
    const raw = await fetchTodayEvents(userId);
    const events: ScheduleEvent[] = raw
      .map(e => ({
        id: e.google_id,
        title: e.title,
        start: e.start_time,
        end: e.end_time,
      }))
      .filter(e => e.start)
      .sort((a, b) => (a.start! < b.start! ? -1 : 1));

    const nowISO = now.toISOString();
    const nextEvent = events.find(e => e.start && e.start >= nowISO) ?? null;

    return { ok: true, events, nextEvent };
  } catch (err) {
    logger.warn({ err, userId }, 'getCalendarToday: calendar fetch failed');
    return { ok: false, events: [], nextEvent: null };
  }
}
