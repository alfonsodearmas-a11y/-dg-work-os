import { NextResponse } from 'next/server';
import { fetchTodayEvents, fetchWeekEvents, classifyCalendarError } from '@/lib/google-calendar';
import type { CalendarEvent } from '@/lib/calendar-types';

const AGENCY_KEYWORDS: Record<string, string[]> = {
  GPL: ['GPL', 'Guyana Power', 'power company'],
  GWI: ['GWI', 'Guyana Water', 'water inc'],
  CJIA: ['CJIA', 'Cheddi Jagan', 'airport'],
  GCAA: ['GCAA', 'Civil Aviation'],
  MARAD: ['MARAD', 'Maritime'],
  HECI: ['HECI', 'Hinterland'],
  HAS: ['HAS', 'Helicopter'],
  InterEnergy: ['InterEnergy', 'Inter Energy', 'Inter-Energy'],
  PPDI: ['PPDI'],
};

interface BriefingEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  attendees: string[];
  description: string | null;
  agency: string | null;
  htmlLink: string | null;
}

function detectAgency(summary: string, description: string | null): string | null {
  const text = `${summary} ${description || ''}`.toLowerCase();
  for (const [agency, keywords] of Object.entries(AGENCY_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
      return agency;
    }
  }
  return null;
}

function formatTime(isoOrDate: string | null, allDay: boolean): string {
  if (!isoOrDate) return '';
  if (allDay) return 'All day';
  const d = new Date(isoOrDate);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Guyana',
  });
}

function toBriefingEvent(event: CalendarEvent): BriefingEvent {
  return {
    id: event.google_id,
    summary: event.title,
    start: formatTime(event.start_time, event.all_day ?? false),
    end: formatTime(event.end_time, event.all_day ?? false),
    allDay: event.all_day ?? false,
    location: event.location,
    attendees: event.attendees?.map(a => a.display_name || a.email) || [],
    description: event.description,
    agency: detectAgency(event.title, event.description),
    htmlLink: event.html_link || null,
  };
}

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function getBusinessDayEnd(days: number): Date {
  const d = new Date();
  let count = 0;
  while (count < days) {
    d.setDate(d.getDate() + 1);
    if (isBusinessDay(d)) count++;
  }
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function GET() {
  try {
    const [todayEvents, weekEvents] = await Promise.all([
      fetchTodayEvents(),
      fetchWeekEvents(),
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const businessEnd = getBusinessDayEnd(5);

    const today = todayEvents.map(toBriefingEvent);

    // Upcoming = week events that are NOT today, within 5 business days
    const upcoming = weekEvents
      .filter(e => {
        const eDate = e.start_time?.slice(0, 10);
        if (!eDate || eDate === todayStr) return false;
        return new Date(eDate) <= businessEnd;
      })
      .map(toBriefingEvent);

    return NextResponse.json({ today, upcoming });
  } catch (err) {
    const classified = classifyCalendarError(err);
    console.error('[Briefing Calendar] Error:', classified.type, classified.message);

    if (classified.type === 'token_expired' || classified.type === 'invalid_credentials' || classified.type === 'no_refresh_token') {
      return NextResponse.json({
        today: [],
        upcoming: [],
        authRequired: true,
      });
    }

    return NextResponse.json({
      today: [],
      upcoming: [],
      authRequired: true,
    });
  }
}
