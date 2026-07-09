import { supabaseAdmin } from './db-admin';
import { CalendarAttendee } from './google-calendar';

export interface CalendarContact {
  id: string;
  email: string;
  display_name: string | null;
  last_event_at: string;
  event_count: number;
  created_at: string;
}

// NOTE: The `calendar_contacts` table was never created — the Calendar Command
// Center feature (commit 8918f16) shipped this code but no migration ever backed
// it, so the table is absent from prod. Until a migration intentionally adds it,
// these helpers degrade to a no-op / empty result rather than 500-ing the
// /api/calendar/contacts endpoint. Preserves the existing contract (arrays of
// CalendarContact) so callers keep working when the table is eventually added.
export async function upsertCalendarContacts(attendees: CalendarAttendee[]): Promise<void> {
  // Unbacked feature: no `calendar_contacts` table exists to write to. No-op.
  void attendees;
  return;
}

export async function searchCalendarContacts(query: string): Promise<CalendarContact[]> {
  // Unbacked feature: no `calendar_contacts` table exists to read from.
  void query;
  return [];
}

export async function getRecentContacts(limit: number = 10): Promise<CalendarContact[]> {
  // Unbacked feature: no `calendar_contacts` table exists to read from.
  void limit;
  return [];
}
