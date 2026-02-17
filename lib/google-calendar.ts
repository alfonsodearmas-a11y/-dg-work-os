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

// --- Lazy-init OAuth2 client with DB token support ---

let cachedOAuth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;
let cachedCalendar: calendar_v3.Calendar | null = null;
let cachedCalendarId: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Invalidate cached clients — called after connect/disconnect */
export function invalidateCalendarClientCache(): void {
  cachedOAuth2Client = null;
  cachedCalendar = null;
  cachedCalendarId = null;
  cacheTimestamp = 0;
  tokenExpiryMs = null;
}

function isCacheValid(): boolean {
  return cachedOAuth2Client !== null && (Date.now() - cacheTimestamp) < CACHE_TTL_MS;
}

/** Get OAuth2 client, checking DB token first then env var fallback */
async function getOAuth2Client(): Promise<InstanceType<typeof google.auth.OAuth2>> {
  if (isCacheValid() && cachedOAuth2Client) {
    return cachedOAuth2Client;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  // Try DB token first
  let refreshToken: string | undefined;
  let calendarId: string | undefined;

  try {
    // Dynamic import to avoid circular dependency at module load time
    const { getGoogleCalendarToken } = await import('./integration-tokens');
    const dbToken = await getGoogleCalendarToken();
    if (dbToken) {
      refreshToken = dbToken.refresh_token;
      calendarId = dbToken.calendar_id || undefined;
    }
  } catch {
    // DB not available — fall through to env var
  }

  // Fall back to env var
  if (!refreshToken) {
    refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  }

  const client = new google.auth.OAuth2(clientId, clientSecret);
  if (refreshToken) {
    client.setCredentials({ refresh_token: refreshToken });
  }

  cachedOAuth2Client = client;
  cachedCalendarId = calendarId || process.env.GOOGLE_CALENDAR_ID || 'primary';
  cacheTimestamp = Date.now();
  tokenExpiryMs = null; // Reset expiry tracking for new client

  return client;
}

/** Get calendar API client */
async function getCalendar(): Promise<calendar_v3.Calendar> {
  if (isCacheValid() && cachedCalendar) {
    return cachedCalendar;
  }

  const auth = await getOAuth2Client();
  cachedCalendar = google.calendar({ version: 'v3', auth });
  return cachedCalendar;
}

/** Get the calendar ID (DB → env var → 'primary') */
async function getCalendarId(): Promise<string> {
  if (isCacheValid() && cachedCalendarId) {
    return cachedCalendarId;
  }

  // getOAuth2Client also populates cachedCalendarId
  await getOAuth2Client();
  return cachedCalendarId || 'primary';
}

// --- Token Management ---
let tokenExpiryMs: number | null = null;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

async function ensureFreshToken(): Promise<void> {
  const client = await getOAuth2Client();
  const now = Date.now();

  if (tokenExpiryMs && now > tokenExpiryMs - TOKEN_REFRESH_BUFFER_MS) {
    await forceTokenRefresh();
    return;
  }

  if (tokenExpiryMs === null) {
    const credentials = client.credentials;
    if (credentials.expiry_date) {
      tokenExpiryMs = credentials.expiry_date;
      if (now > tokenExpiryMs - TOKEN_REFRESH_BUFFER_MS) {
        await forceTokenRefresh();
      }
    }
  }
}

async function forceTokenRefresh(): Promise<void> {
  try {
    const client = await getOAuth2Client();
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    tokenExpiryMs = credentials.expiry_date ?? null;
  } catch (err) {
    console.error('[Calendar] Token refresh failed:', err);
    throw err;
  }
}

async function withTokenRetry<T>(fn: () => Promise<T>): Promise<T> {
  await ensureFreshToken();
  try {
    return await fn();
  } catch (err) {
    const classified = classifyCalendarError(err);
    if (classified.type === 'token_expired' || classified.type === 'invalid_credentials') {
      try {
        await forceTokenRefresh();
        return await fn();
      } catch (retryErr) {
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
  // Check if any token source is available (DB or env var)
  let hasToken = false;
  try {
    const { getGoogleCalendarToken } = await import('./integration-tokens');
    const dbToken = await getGoogleCalendarToken();
    if (dbToken) hasToken = true;
  } catch {
    // DB unavailable
  }
  if (!hasToken && !process.env.GOOGLE_REFRESH_TOKEN) {
    return { ok: false, error: 'no_refresh_token', message: 'Google Calendar refresh token not configured', authStatus: 'not_configured' };
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return { ok: false, error: 'invalid_credentials', message: 'Google OAuth credentials not configured', authStatus: 'not_configured' };
  }

  try {
    const cal = await getCalendar();
    const calId = await getCalendarId();
    await withTokenRetry(() =>
      cal.events.list({
        calendarId: calId,
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

  // invalid_grant can come as 400 (token endpoint) or 401/403 (API endpoint)
  if (msg.includes('invalid_grant') || msg.includes('Token has been expired') || msg.includes('Token has been revoked')) {
    return { type: 'token_expired', message: 'Google Calendar token expired — please reconnect' };
  }

  if (status === 401 || status === 403) {
    if (msg.includes('expired') || msg.includes('revoked')) {
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

  const cal = await getCalendar();
  const calId = await getCalendarId();

  const response = await withTokenRetry(() =>
    cal.events.list({
      calendarId: calId,
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

  const cal = await getCalendar();
  const calId = await getCalendarId();

  const response = await withTokenRetry(() =>
    cal.events.list({
      calendarId: calId,
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

  const cal = await getCalendar();
  const calId = await getCalendarId();

  const response = await withTokenRetry(() =>
    cal.events.list({
      calendarId: calId,
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

  const cal = await getCalendar();
  const calId = await getCalendarId();

  const response = await withTokenRetry(() =>
    cal.events.list({
      calendarId: calId,
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

function normalizeDateTime(dt: string): string {
  if (/[Z+-]\d{2}:\d{2}$/.test(dt) || dt.endsWith('Z')) return dt;
  if (/T\d{2}:\d{2}$/.test(dt)) dt += ':00';
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

  const cal = await getCalendar();
  const calId = await getCalendarId();

  const response = await withTokenRetry(() =>
    cal.events.insert({
      calendarId: calId,
      requestBody: eventBody,
      conferenceDataVersion: input.add_google_meet ? 1 : undefined,
      sendUpdates: input.attendees && input.attendees.length > 0 ? 'all' : 'none',
    })
  );

  return transformEvent(response.data);
}

export async function updateEvent(eventId: string, input: UpdateEventInput): Promise<CalendarEvent> {
  const cal = await getCalendar();
  const calId = await getCalendarId();

  const existing = await withTokenRetry(() =>
    cal.events.get({
      calendarId: calId,
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
    cal.events.update({
      calendarId: calId,
      eventId,
      requestBody: eventBody,
      conferenceDataVersion: input.add_google_meet ? 1 : undefined,
      sendUpdates: input.attendees && input.attendees.length > 0 ? 'all' : 'none',
    })
  );

  return transformEvent(response.data);
}

export async function deleteEvent(eventId: string): Promise<void> {
  const cal = await getCalendar();
  const calId = await getCalendarId();

  await withTokenRetry(() =>
    cal.events.delete({
      calendarId: calId,
      eventId
    })
  );
}
