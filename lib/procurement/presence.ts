// ── Tender presence event writer ─────────────────────────────────────────────
//
// Single chokepoint for inserting rows into tender_presence_event. Replaces
// the '__presence' sentinel rows that were previously written into
// tender_field_change.
//
// Schema: tender_presence_event (migration 097). Either upload_id or
// actor_id must be set so every row has provenance.

import { supabaseAdmin } from '@/lib/db';

export type TenderPresenceEventType = 'disappeared' | 'reappeared';

export interface RecordPresenceEventInput {
  tender_id: string;
  event_type: TenderPresenceEventType;
  agency: string;
  upload_id?: string | null;
  actor_id?: string | null;
  actor_role?: string | null;
}

export async function recordPresenceEvent(input: RecordPresenceEventInput): Promise<void> {
  if (!input.upload_id && !input.actor_id) {
    throw new Error('tender_presence_event requires either upload_id or actor_id');
  }
  const { error } = await supabaseAdmin
    .from('tender_presence_event')
    .insert({
      tender_id: input.tender_id,
      event_type: input.event_type,
      agency: input.agency,
      upload_id: input.upload_id ?? null,
      actor_id: input.actor_id ?? null,
      actor_role: input.actor_role ?? null,
    });
  if (error) throw error;
}

export async function recordPresenceEventsBatch(rows: RecordPresenceEventInput[]): Promise<void> {
  if (rows.length === 0) return;
  for (const r of rows) {
    if (!r.upload_id && !r.actor_id) {
      throw new Error('tender_presence_event requires either upload_id or actor_id');
    }
  }
  const { error } = await supabaseAdmin
    .from('tender_presence_event')
    .insert(
      rows.map((r) => ({
        tender_id: r.tender_id,
        event_type: r.event_type,
        agency: r.agency,
        upload_id: r.upload_id ?? null,
        actor_id: r.actor_id ?? null,
        actor_role: r.actor_role ?? null,
      })),
    );
  if (error) throw error;
}
