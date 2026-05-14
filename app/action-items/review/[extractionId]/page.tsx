import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { ExtractionToolInputZ } from '@/lib/action-items/extraction/types';
import { resolveExtractedItem, type ReviewableItem } from '@/lib/action-items/resolution/resolve';
import { requiresMandatoryReview } from '@/lib/action-items/gate';
import { evaluateTrust } from '@/lib/action-items/trust/tracker';
import { ReviewClient } from '@/components/action-items/ReviewClient';
import { getTranscript } from '@/lib/action-items/fireflies/client';
import type { UserStaffFields } from '@/lib/action-items/types';

const ALLOWED = new Set(['dg', 'ps', 'parl_sec']);
export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ extractionId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!ALLOWED.has(session.user.role)) redirect('/login');
  const { extractionId } = await params;

  const { data: ext } = await supabaseAdmin
    .from('action_item_extractions')
    .select('id, meeting_id, meeting_title, meeting_date, modality, raw_response, items_extracted')
    .eq('id', extractionId).maybeSingle();
  if (!ext) notFound();

  const parsed = ExtractionToolInputZ.safeParse(ext.raw_response);
  if (!parsed.success) {
    return <div className="p-6 text-red-500">Extraction raw_response failed schema validation.</div>;
  }
  const rawItems = parsed.data.items;

  const { data: meetingRow } = await supabaseAdmin
    .from('meetings_seen').select('detected_type, detected_modality, attendee_emails')
    .eq('fireflies_meeting_id', ext.meeting_id as string).maybeSingle();
  const meeting = {
    detected_type: (meetingRow?.detected_type ?? null) as 'internal' | 'agency' | 'external' | null,
    detected_modality: (meetingRow?.detected_modality ?? null) as 'virtual' | 'in_person' | 'mixed' | null,
    inaudible_pct: 0,   // Plan 4.1 will count [inaudible] markers; v1 stub
  };

  const trust = (meeting.detected_type && meeting.detected_modality)
    ? await evaluateTrust(meeting.detected_type, meeting.detected_modality)
    : { activated: false } as { activated: boolean };

  const { data: usersRaw } = await supabaseAdmin
    .from('users')
    .select('id, email, name, role, agency, aliases, closure_mode, is_agency_head, is_active')
    .eq('is_active', true);
  const allUsers: UserStaffFields[] = (usersRaw ?? []).map(u => ({
    id: u.id as string,
    email: (u.email as string) ?? '',
    name: u.name as string | null,
    role: u.role as UserStaffFields['role'],
    agency: u.agency as string | null,
    aliases: (u.aliases as string[] | null) ?? [],
    closure_mode: (u.closure_mode as 'self_close' | 'dg_managed') ?? 'self_close',
    is_agency_head: !!u.is_agency_head,
    is_active: !!u.is_active,
  }));
  const attendeeEmails = new Set(((meetingRow?.attendee_emails as string[] | null) ?? []).map(e => e.toLowerCase()));
  const attendees = allUsers.filter(u => u.email && attendeeEmails.has(u.email.toLowerCase()));

  // Fetch the transcript so resolveExtractedItem's quote-substring check has
  // real text to match against. Without this every item shows the
  // "quote_fabricated" warning at render. The same transcript is fetched
  // again at submit by the batch endpoint's authoritative gate (Plan 4
  // correction #2); one extra Fireflies fetch per page load is cheap and
  // gives reviewers visibility into real quote problems before Submit.
  const transcript = await getTranscript(ext.meeting_id as string);
  const transcriptText = transcript
    ? (transcript.sentences ?? [])
        .map(s => `[${s.start_time ?? '?'}] ${s.speaker_name ?? '?'}: ${s.text}`)
        .join('\n')
    : '';

  const ctx = {
    meeting_date: ext.meeting_date ? new Date(ext.meeting_date as string) : new Date(),
    attendees, allUsers,
    transcript_text: transcriptText,
    speaker_role: 'officer' as const,
  };

  const reviewables: Array<{ index: number; item: ReviewableItem }> = rawItems.map((r, i) => ({
    index: i,
    item: resolveExtractedItem(r, ctx),
  }));

  const buckets: {
    mandatory: typeof reviewables;
    quickScan: typeof reviewables;
    autoAccepted: typeof reviewables;
  } = { mandatory: [], quickScan: [], autoAccepted: [] };
  for (const r of reviewables) {
    const owner = allUsers.find(u => u.id === r.item.owner_id) ?? {
      id: '', email: '', name: null, role: 'officer', agency: null, aliases: [],
      closure_mode: 'self_close', is_agency_head: false, is_active: true,
    } as UserStaffFields;
    const mand = requiresMandatoryReview(
      {
        confidence_overall: r.item.confidence_overall,
        validation_failed: !r.item.validation_ok,
        owner_id: r.item.owner_id,
        due_at: r.item.due_at,
        due_trigger: r.item.due_trigger,
      },
      meeting, owner,
    );
    if (mand) buckets.mandatory.push(r);
    else if (trust.activated && (r.item.confidence_overall ?? 0) >= 0.9) buckets.autoAccepted.push(r);
    else buckets.quickScan.push(r);
  }

  return (
    <ReviewClient
      extractionId={ext.id as string}
      meetingTitle={ext.meeting_title as string | null}
      meetingDate={ext.meeting_date as string | null}
      buckets={buckets}
      ownerOptions={allUsers.map(u => ({ id: u.id, name: u.name ?? '(unnamed)', agency: u.agency }))}
    />
  );
}
