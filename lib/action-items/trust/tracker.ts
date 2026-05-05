import 'server-only';
import { supabaseAdmin } from '@/lib/db';

export interface TrustResult {
  activated: boolean;
  meeting_type: 'internal' | 'agency' | 'external';
  modality: 'virtual' | 'in_person' | 'mixed';
  meetings_reviewed: number;
  accepted_unedited_pct: number;
  attribution_errors_in_window: number;
  earliest_review: string | null;
  reason: string;
}

const WINDOW_SIZE = 20;

export interface TrustCounters {
  meetings_reviewed: number;
  accepted_unedited_pct: number;
  attribution_errors_in_window: number;
  earliest_review: string | null;
}

export function computeActivation(
  c: TrustCounters,
  flagOn: boolean,
  now: Date = new Date(),
): { activated: boolean; reason: string } {
  if (!flagOn) return { activated: false, reason: 'EARNED_TRUST_ENABLED not set' };
  if (c.meetings_reviewed < 8) return { activated: false, reason: `Need 8 meetings, have ${c.meetings_reviewed}` };
  if (c.accepted_unedited_pct < 0.95) return { activated: false, reason: `accepted-unedited ${(c.accepted_unedited_pct * 100).toFixed(1)}% < 95%` };
  if (c.attribution_errors_in_window > 0) return { activated: false, reason: `attribution errors in window: ${c.attribution_errors_in_window}` };
  if (!c.earliest_review) return { activated: false, reason: 'no reviews yet' };
  const daysOpen = (now.getTime() - new Date(c.earliest_review).getTime()) / (24 * 60 * 60 * 1000);
  if (daysOpen < 30) return { activated: false, reason: `Window only ${daysOpen.toFixed(1)} days old (need 30)` };
  return { activated: true, reason: 'all criteria met' };
}

export async function evaluateTrust(
  meetingType: TrustResult['meeting_type'],
  modality: TrustResult['modality'],
): Promise<TrustResult> {
  const flagOn = process.env.EARNED_TRUST_ENABLED === 'true';

  const { data: ex } = await supabaseAdmin
    .from('action_item_extractions')
    .select('id, meeting_date, review_status, items_extracted, items_accepted, items_edited, reviewed_at')
    .eq('meeting_type', meetingType)
    .eq('modality', modality)
    .eq('review_status', 'complete')
    .order('reviewed_at', { ascending: false })
    .limit(WINDOW_SIZE);

  const window = (ex ?? []) as Array<{
    id: string; reviewed_at: string;
    items_extracted: number; items_accepted: number; items_edited: number;
  }>;
  const meetings_reviewed = window.length;
  const totalExtracted = window.reduce((s, e) => s + (e.items_extracted ?? 0), 0);
  const totalAccepted   = window.reduce((s, e) => s + (e.items_accepted ?? 0), 0);
  const totalEdited     = window.reduce((s, e) => s + (e.items_edited ?? 0), 0);
  const acceptedUnedited = totalAccepted - totalEdited;
  const acceptedUneditedPct = totalExtracted > 0 ? acceptedUnedited / totalExtracted : 0;

  const earliestReview = window.length > 0 ? window[window.length - 1].reviewed_at : null;

  let attributionErrors = 0;
  if (earliestReview) {
    const { data: events } = await supabaseAdmin
      .from('action_item_events')
      .select('id')
      .eq('event_type', 'attribution_error_flagged')
      .gte('occurred_at', earliestReview);
    attributionErrors = events?.length ?? 0;
  }

  const counters: TrustCounters = {
    meetings_reviewed,
    accepted_unedited_pct: acceptedUneditedPct,
    attribution_errors_in_window: attributionErrors,
    earliest_review: earliestReview,
  };
  const { activated, reason } = computeActivation(counters, flagOn);

  return {
    activated, meeting_type: meetingType, modality,
    meetings_reviewed,
    accepted_unedited_pct: acceptedUneditedPct,
    attribution_errors_in_window: attributionErrors,
    earliest_review: earliestReview,
    reason,
  };
}
