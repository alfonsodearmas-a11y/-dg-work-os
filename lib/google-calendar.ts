import { google, calendar_v3 } from 'googleapis';

// Re-export types for backward compatibility with server-side consumers
export type {
  CalendarAttendee,
  ConferenceData,
  CalendarEvent,
  CreateEventInput,
  UpdateEventInput,
  EventCategory,
} from './calendar-types';
export { detectEventCategory } from './calendar-types';

import type { CalendarAttendee, ConferenceData, CalendarEvent, CreateEventInput, UpdateEventInput } from './calendar-types';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// --- Token Management ---
// Track token expiry to proactively refresh before it expires
let tokenExpiryMs: number | null = null;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry

/** Proactively refresh the access token if it's within 5 min of expiring */
async function ensureFreshToken(): Promise<void> {
  const now = Date.now();
  // If we have a known expiry and it's within the buffer window, force refresh
  if (tokenExpiryMs && now > tokenExpiryMs - TOKEN_REFRESH_BUFFER_MS) {
    await forceTokenRefresh();
    return;
  }
  // If we've never fetched a token, get one now so we know the expiry
  if (tokenExpiryMs === null) {
    const credentials = oauth2Client.credentials;
    if (credentials.expiry_date) {
      tokenExpiryMs = credentials.expiry_date;
      if (now > tokenExpiryMs - TOKEN_REFRESH_BUFFER_MS) {
        await forceTokenRefresh();
      }
    }
  }
}

/** Force a token refresh and update the tracked expiry */
async function forceTokenRefresh(): Promise<void> {
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    tokenExpiryMs = credentials.expiry_date ?? null;
  } catch (err) {
    console.error('[Calendar] Token refresh failed:', err);
    throw err;
  }
}

/**
 * Execute a calendar API call with automatic retry on auth errors.
 * On 401/invalid_grant, attempts one token refresh then retries.
 */
async function withTokenRetry<T>(fn: () => Promise<T>): Promise<T> {
  await ensureFreshToken();
  try {
    return await fn();
  } catch (err) {
    const classified = classifyCalendarError(err);
    if (classified.type === 'token_expired' || classified.type === 'invalid_credentials') {
      // One retry after forcing a token refresh
      try {
        await forceTokenRefresh();
        return await fn();
      } catch (retryErr) {
        // Retry also failed — surface the error with auth flag
        throw retryErr;
      }
    }
    throw err;
  }
}

// --- Connection Test ---

export interface CalendarConnectionStatus {
  ok: boolean;
  error?: 'token_expired' | 'invalid_credentials' | 'no_refresh_token' | 'network_error' | 'unknown';
  message?: string;
  authStatus?: 'connected' | 'reauth_required' | 'not_configured';
}

export async function testCalendarConnection(): Promise<CalendarConnectionStatus> {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return { ok: false, error: 'no_refresh_token', message: 'Google Calendar refresh token not configured', authStatus: 'not_configured' };
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return { ok: false, error: 'invalid_credentials', message: 'Google OAuth credentials not configured', authStatus: 'not_configured' };
  }

  try {
    await withTokenRetry(() =>
      calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        maxResults: 1,
        timeMin: new Date().toISOString(),
      })
    );
    return { ok: true, authStatus: 'connected' };
  } catch (err: unknown) {
    const error = err as { code?: number; message?: string; response?: { status?: number } };
    const status = error.code || error.response?.status;

    if (status === 401 || status === 403) {
      const msg = error.message || '';
      if (msg.includes('invalid_grant') || msg.includes('Token has been expired') || msg.includes('Token has been revoked')) {
        return { ok: false, error: 'token_expired', message: 'Google Calendar refresh token has expired. Please re-authorize.', authStatus: 'reauth_required' };
      }
      return { ok: false, error: 'invalid_credentials', message: `Google Calendar auth failed (${status}): ${msg}`, authStatus: 'reauth_required' };
    }

    return { ok: false, error: 'network_error', message: `Google Calendar connection error: ${error.message || 'Unknown'}`, authStatus: 'connected' };
  }
}

// --- Error Classification Helper ---

export function classifyCalendarError(err: unknown): { type: string; message: string } {
  const error = err as { code?: number; message?: string; response?: { status?: number } };
  const status = error.code || error.response?.status;
  const msg = error.message || 'Unknown error';

  if (status === 401 || status === 403) {
    if (msg.includes('invalid_grant') || msg.includes('expired') || msg.includes('revoked')) {
      return { type: 'token_expired', message: 'Google Calendar token expired — please reconnect' };
    }
    return { type: 'invalid_credentials', message: `Auth error: ${msg}` };
  }

  if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('network') || msg.includes('ETIMEDOUT')) {
    return { type: 'network_error', message: 'Cannot reach Google Calendar API' };
  }

  if (msg.includes('Rate Limit') || status === 429) {
    return { type: 'rate_limited', message: 'Google Calendar rate limit reached — try again shortly' };
  }

  return { type: 'unknown', message: msg };
}

// --- Shared Transform Helper ---

function transformEvent(event: calendar_v3.Schema$Event): CalendarEvent {
  return {
    google_id: event.id || '',
    title: event.summary || 'Untitled',
    start_time: event.start?.dateTime || event.start?.date || null,
    end_time: event.end?.dateTime || event.end?.date || null,
    location: event.location || null,
    description: event.description || null,
    all_day: !event.start?.dateTime,
    attendees: event.attendees?.map(a => ({
      email: a.email || '',
      display_name: a.displayName || undefined,
      response_status: (a.responseStatus as CalendarAttendee['response_status']) || undefined,
      self: a.self || undefined,
      organizer: a.organizer || undefined,
    })),
    conference_data: event.conferenceData ? {
      entry_points: (event.conferenceData.entryPoints || []).map(ep => ({
        entry_point_type: (ep.entryPointType as ConferenceData['entry_points'][0]['entry_point_type']) || 'more',
        uri: ep.uri || '',
        label: ep.label || undefined,
      })),
      conference_solution: event.conferenceData.conferenceSolution ? {
        name: event.conferenceData.conferenceSolution.name || '',
        icon_uri: event.conferenceData.conferenceSolution.iconUri || undefined,
      } : undefined,
    } : null,
    status: (event.status as CalendarEvent['status']) || undefined,
    color_id: event.colorId || null,
    organizer: event.organizer ? {
      email: event.organizer.email || '',
      displayName: event.organizer.displayName || undefined,
      self: event.organizer.self || undefined,
    } : undefined,
    html_link: event.htmlLink || undefined,
    recurring_event_id: event.recurringEventId || null,
  };
}

// --- Fetch Functions (all wrapped with automatic token retry) ---

export async function fetchTodayEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const response = await withTokenRetry(() =>
    calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    })
  );

  return response.data.items?.map(transformEvent) || [];
}

export async function fetchTomorrowEvents(): Promise<CalendarEvent[]> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const startOfDay = new Date(tomorrow);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(tomorrow);
  endOfDay.setHours(23, 59, 59, 999);

  const response = await withTokenRetry(() =>
    calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    })
  );

  return response.data.items?.map(transformEvent) || [];
}

export async function fetchWeekEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const endOfWeek = new Date();
  endOfWeek.setDate(now.getDate() + 7);

  const response = await withTokenRetry(() =>
    calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      timeMin: now.toISOString(),
      timeMax: endOfWeek.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    })
  );

  return response.data.items?.map(transformEvent) || [];
}

export async function fetchMonthEvents(year: number, month: number): Promise<CalendarEvent[]> {
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

  const response = await withTokenRetry(() =>
    calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      timeMin: startOfMonth.toISOString(),
      timeMax: endOfMonth.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250
    })
  );

  return response.data.items?.map(transformEvent) || [];
}

// --- Helpers ---

/** Normalize datetime-local values ("2026-02-08T14:00") to full ISO with timezone */
function normalizeDateTime(dt: string): string {
  // Already has timezone offset or Z → leave as-is
  if (/[Z+-]\d{2}:\d{2}$/.test(dt) || dt.endsWith('Z')) return dt;
  // Add seconds if missing ("T14:00" → "T14:00:00")
  if (/T\d{2}:\d{2}$/.test(dt)) dt += ':00';
  // Append Guyana timezone (UTC-04:00)
  return dt + '-04:00';
}

// --- CRUD (all wrapped with automatic token retry) ---

export async function createEvent(input: CreateEventInput): Promise<CalendarEvent> {
  const eventBody: Record<string, unknown> = {
    summary: input.title,
    location: input.location,
    description: input.description,
  };

  if (input.all_day) {
    eventBody.start = { date: input.start_time.split('T')[0] };
    eventBody.end = { date: input.end_time.split('T')[0] };
  } else {
    eventBody.start = { dateTime: normalizeDateTime(input.start_time), timeZone: 'America/Guyana' };
    eventBody.end = { dateTime: normalizeDateTime(input.end_time), timeZone: 'America/Guyana' };
  }

  if (input.attendees && input.attendees.length > 0) {
    eventBody.attendees = input.attendees.map(email => ({ email }));
  }

  if (input.add_google_meet) {
    eventBody.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  const response = await withTokenRetry(() =>
    calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      requestBody: eventBody,
      conferenceDataVersion: input.add_google_meet ? 1 : undefined,
      sendUpdates: input.attendees && input.attendees.length > 0 ? 'all' : 'none',
    })
  );

  return transformEvent(response.data);
}

export async function updateEvent(eventId: string, input: UpdateEventInput): Promise<CalendarEvent> {
  const existing = await withTokenRetry(() =>
    calendar.events.get({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      eventId
    })
  );

  const eventBody: Record<string, unknown> = {
    summary: input.title ?? existing.data.summary,
    location: input.location ?? existing.data.location,
    description: input.description ?? existing.data.description,
  };

  const isAllDay = input.all_day ?? !existing.data.start?.dateTime;
  if (isAllDay) {
    eventBody.start = { date: (input.start_time || existing.data.start?.dateTime || existing.data.start?.date)?.split('T')[0] };
    eventBody.end = { date: (input.end_time || existing.data.end?.dateTime || existing.data.end?.date)?.split('T')[0] };
  } else {
    const startDt = input.start_time || existing.data.start?.dateTime;
    const endDt = input.end_time || existing.data.end?.dateTime;
    eventBody.start = {
      dateTime: startDt ? normalizeDateTime(startDt) : undefined,
      timeZone: 'America/Guyana'
    };
    eventBody.end = {
      dateTime: endDt ? normalizeDateTime(endDt) : undefined,
      timeZone: 'America/Guyana'
    };
  }

  if (input.attendees !== undefined) {
    eventBody.attendees = input.attendees.map(email => ({ email }));
  }

  if (input.add_google_meet) {
    eventBody.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  const response = await withTokenRetry(() =>
    calendar.events.update({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      eventId,
      requestBody: eventBody,
      conferenceDataVersion: input.add_google_meet ? 1 : undefined,
      sendUpdates: input.attendees && input.attendees.length > 0 ? 'all' : 'none',
    })
  );

  return transformEvent(response.data);
}

export async function deleteEvent(eventId: string): Promise<void> {
  await withTokenRetry(() =>
    calendar.events.delete({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      eventId
    })
  );
}
