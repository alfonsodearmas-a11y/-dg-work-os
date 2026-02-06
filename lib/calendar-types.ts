// Shared calendar types and utilities — safe for client and server imports.
// No server-only dependencies (googleapis, etc.) in this file.

export interface CalendarAttendee {
  email: string;
  display_name?: string;
  response_status?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  self?: boolean;
  organizer?: boolean;
}

export interface ConferenceData {
  entry_points: Array<{
    entry_point_type: 'video' | 'phone' | 'sip' | 'more';
    uri: string;
    label?: string;
  }>;
  conference_solution?: { name: string; icon_uri?: string };
}

export interface CalendarEvent {
  google_id: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  description: string | null;
  all_day?: boolean;
  attendees?: CalendarAttendee[];
  conference_data?: ConferenceData | null;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  color_id?: string | null;
  organizer?: { email: string; displayName?: string; self?: boolean };
  html_link?: string;
  recurring_event_id?: string | null;
}

export interface CreateEventInput {
  title: string;
  start_time: string;
  end_time: string;
  location?: string;
  description?: string;
  all_day?: boolean;
  attendees?: string[];
  add_google_meet?: boolean;
}

export interface UpdateEventInput {
  title?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  description?: string;
  all_day?: boolean;
}

// --- Event Category Detection ---

export type EventCategory = 'ministry' | 'board' | 'external' | 'personal' | 'blocked';

const MINISTRY_KEYWORDS = ['ministry', 'gpl', 'gwi', 'cjia', 'gcaa', 'director general', 'minister', 'permanent secretary'];
const BOARD_KEYWORDS = ['board', 'committee', 'council', 'governance'];
const BLOCKED_KEYWORDS = ['block', 'focus', 'no meetings', 'do not disturb', 'busy', 'travel', 'lunch'];

export function detectEventCategory(event: CalendarEvent): EventCategory {
  const text = `${event.title} ${event.description || ''}`.toLowerCase();

  if (BLOCKED_KEYWORDS.some(kw => text.includes(kw))) return 'blocked';
  if (BOARD_KEYWORDS.some(kw => text.includes(kw))) return 'board';
  if (MINISTRY_KEYWORDS.some(kw => text.includes(kw))) return 'ministry';

  // Check for external attendees (non-self, different domain)
  if (event.attendees && event.attendees.length > 0) {
    const selfAttendee = event.attendees.find(a => a.self);
    const selfDomain = selfAttendee?.email?.split('@')[1];
    const hasExternal = event.attendees.some(a =>
      !a.self && selfDomain && a.email.split('@')[1] !== selfDomain
    );
    if (hasExternal) return 'external';
  }

  return 'personal';
}
