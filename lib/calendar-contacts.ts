import { supabaseAdmin } from './db';
import { CalendarAttendee } from './google-calendar';

export interface CalendarContact {
  id: string;
  email: string;
  display_name: string | null;
  last_event_at: string;
  event_count: number;
  created_at: string;
}

export async function upsertCalendarContacts(attendees: CalendarAttendee[]): Promise<void> {
  if (!attendees || attendees.length === 0) return;

  for (const attendee of attendees) {
    if (!attendee.email) continue;

    const { data: existing } = await supabaseAdmin
      .from('calendar_contacts')
      .select('id, event_count')
      .eq('email', attendee.email)
      .single();

    if (existing) {
      await supabaseAdmin
        .from('calendar_contacts')
        .update({
          display_name: attendee.display_name || undefined,
          last_event_at: new Date().toISOString(),
          event_count: (existing.event_count || 0) + 1,
        })
        .eq('id', existing.id);
    } else {
      await supabaseAdmin
        .from('calendar_contacts')
        .insert({
          email: attendee.email,
          display_name: attendee.display_name || null,
          last_event_at: new Date().toISOString(),
          event_count: 1,
        });
    }
  }
}

export async function searchCalendarContacts(query: string): Promise<CalendarContact[]> {
  const { data, error } = await supabaseAdmin
    .from('calendar_contacts')
    .select('*')
    .or(`email.ilike.%${query}%,display_name.ilike.%${query}%`)
    .order('event_count', { ascending: false })
    .limit(10);

  if (error) throw error;
  return data || [];
}

export async function getRecentContacts(limit: number = 10): Promise<CalendarContact[]> {
  const { data, error } = await supabaseAdmin
    .from('calendar_contacts')
    .select('*')
    .order('last_event_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
