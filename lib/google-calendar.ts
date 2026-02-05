import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

export interface CalendarEvent {
  google_id: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  description: string | null;
  all_day?: boolean;
}

export interface CreateEventInput {
  title: string;
  start_time: string;
  end_time: string;
  location?: string;
  description?: string;
  all_day?: boolean;
}

export interface UpdateEventInput {
  title?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  description?: string;
  all_day?: boolean;
}

export async function fetchTodayEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const response = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime'
  });

  return response.data.items?.map(event => ({
    google_id: event.id || '',
    title: event.summary || 'Untitled',
    start_time: event.start?.dateTime || event.start?.date || null,
    end_time: event.end?.dateTime || event.end?.date || null,
    location: event.location || null,
    description: event.description || null,
    all_day: !event.start?.dateTime
  })) || [];
}

export async function fetchWeekEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const endOfWeek = new Date();
  endOfWeek.setDate(now.getDate() + 7);

  const response = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    timeMin: now.toISOString(),
    timeMax: endOfWeek.toISOString(),
    singleEvents: true,
    orderBy: 'startTime'
  });

  return response.data.items?.map(event => ({
    google_id: event.id || '',
    title: event.summary || 'Untitled',
    start_time: event.start?.dateTime || event.start?.date || null,
    end_time: event.end?.dateTime || event.end?.date || null,
    location: event.location || null,
    description: event.description || null,
    all_day: !event.start?.dateTime
  })) || [];
}

export async function fetchMonthEvents(year: number, month: number): Promise<CalendarEvent[]> {
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

  const response = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    timeMin: startOfMonth.toISOString(),
    timeMax: endOfMonth.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250
  });

  return response.data.items?.map(event => ({
    google_id: event.id || '',
    title: event.summary || 'Untitled',
    start_time: event.start?.dateTime || event.start?.date || null,
    end_time: event.end?.dateTime || event.end?.date || null,
    location: event.location || null,
    description: event.description || null,
    all_day: !event.start?.dateTime
  })) || [];
}

export async function createEvent(input: CreateEventInput): Promise<CalendarEvent> {
  const eventBody: any = {
    summary: input.title,
    location: input.location,
    description: input.description,
  };

  if (input.all_day) {
    // All-day events use date format (YYYY-MM-DD)
    eventBody.start = { date: input.start_time.split('T')[0] };
    eventBody.end = { date: input.end_time.split('T')[0] };
  } else {
    // Timed events use dateTime format
    eventBody.start = { dateTime: input.start_time, timeZone: 'America/Guyana' };
    eventBody.end = { dateTime: input.end_time, timeZone: 'America/Guyana' };
  }

  const response = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    requestBody: eventBody
  });

  const event = response.data;
  return {
    google_id: event.id || '',
    title: event.summary || 'Untitled',
    start_time: event.start?.dateTime || event.start?.date || null,
    end_time: event.end?.dateTime || event.end?.date || null,
    location: event.location || null,
    description: event.description || null,
    all_day: !event.start?.dateTime
  };
}

export async function updateEvent(eventId: string, input: UpdateEventInput): Promise<CalendarEvent> {
  // First get the existing event
  const existing = await calendar.events.get({
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    eventId
  });

  const eventBody: any = {
    summary: input.title ?? existing.data.summary,
    location: input.location ?? existing.data.location,
    description: input.description ?? existing.data.description,
  };

  if (input.start_time || input.end_time) {
    if (input.all_day) {
      eventBody.start = { date: (input.start_time || existing.data.start?.dateTime || existing.data.start?.date)?.split('T')[0] };
      eventBody.end = { date: (input.end_time || existing.data.end?.dateTime || existing.data.end?.date)?.split('T')[0] };
    } else {
      eventBody.start = {
        dateTime: input.start_time || existing.data.start?.dateTime,
        timeZone: 'America/Guyana'
      };
      eventBody.end = {
        dateTime: input.end_time || existing.data.end?.dateTime,
        timeZone: 'America/Guyana'
      };
    }
  }

  const response = await calendar.events.update({
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    eventId,
    requestBody: eventBody
  });

  const event = response.data;
  return {
    google_id: event.id || '',
    title: event.summary || 'Untitled',
    start_time: event.start?.dateTime || event.start?.date || null,
    end_time: event.end?.dateTime || event.end?.date || null,
    location: event.location || null,
    description: event.description || null,
    all_day: !event.start?.dateTime
  };
}

export async function deleteEvent(eventId: string): Promise<void> {
  await calendar.events.delete({
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    eventId
  });
}
