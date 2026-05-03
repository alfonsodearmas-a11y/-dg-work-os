import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  AGENCY_LABEL,
  TENDER_STAGES,
  type ArchiveReasonCode,
  type PipelineStats,
  type Tender,
  type TenderAgency,
  type TenderDocument,
  type TenderFieldChange,
  type TenderMethod,
  type TenderNote,
  type TenderStage,
  type TenderStageSource,
  type TenderSource,
} from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

const TENDER_COLUMNS = [
  'id', 'source', 'external_id', 'description', 'agency',
  'programme_code', 'sub_programme_code', 'programme_activity',
  'line_item_code', 'stage', 'stage_source', 'method',
  'is_rollover', 'has_exception',
  'date_advertised', 'date_closed', 'date_eval_sent_mtb_rtb',
  'date_eval_sent_nptab', 'date_of_award',
  'contractor', 'implementation_start_date',
  'implementation_end_date', 'implementation_status_pct',
  'remarks',
  'missing_from_last_upload',
  'first_seen_upload_id', 'last_seen_upload_id',
  'awarded_at', 'first_appearance_already_awarded',
  'archived_at', 'archived_by', 'archived_role',
  'archive_reason_code', 'archive_reason_text',
  'created_by', 'created_at', 'updated_at',
].join(', ');

const STALLED_THRESHOLD_DAYS = 30;

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveJoinedName(raw: unknown): string {
  const resolved = (Array.isArray(raw) ? raw[0] : raw) as { name?: string } | null;
  return resolved?.name || 'Unknown';
}

function computeDaysSince(referenceISO: string | null | undefined): number {
  if (!referenceISO) return 0;
  const t = new Date(referenceISO).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
}

// Days in current stage, derived strictly from PSIP dates. Returns null when
// the required date is missing, the tender is a rollover / has_exception, or
// the stage has no SLA (design, award). No updated_at fallback — updated_at
// churns on every weekly upload and is not a signal of stage progression.
export function computeDaysInStage(
  stage: TenderStage,
  row: {
    date_advertised?: string | null;
    date_closed?: string | null;
    date_eval_sent_mtb_rtb?: string | null;
    date_eval_sent_nptab?: string | null;
    is_rollover?: boolean | null;
    has_exception?: boolean | null;
  },
  now: Date = new Date(),
): number | null {
  if (row.is_rollover || row.has_exception) return null;

  let ref: string | null | undefined;
  switch (stage) {
    case 'advertised':
      ref = row.date_advertised;
      break;
    case 'evaluation':
      ref = row.date_closed;
      break;
    case 'awaiting_award':
      ref = row.date_eval_sent_nptab ?? row.date_eval_sent_mtb_rtb ?? row.date_closed;
      break;
    default:
      return null;
  }

  if (!ref) return null;
  const t = new Date(ref).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / (1000 * 60 * 60 * 24)));
}

function agencyName(code: string): string {
  return (AGENCY_LABEL as Record<string, string>)[code.toUpperCase()] || code;
}

function enrichTender(row: Record<string, unknown>): Tender {
  const stage = row.stage as TenderStage;
  return {
    id: row.id as string,
    source: row.source as TenderSource,
    external_id: (row.external_id as string) ?? null,
    description: row.description as string,
    agency: row.agency as TenderAgency,
    programme_code: (row.programme_code as string) ?? null,
    sub_programme_code: (row.sub_programme_code as string) ?? null,
    programme_activity: (row.programme_activity as string) ?? null,
    line_item_code: (row.line_item_code as string) ?? null,
    stage: row.stage as TenderStage,
    stage_source: row.stage_source as TenderStageSource,
    method: (row.method as TenderMethod) ?? null,
    is_rollover: Boolean(row.is_rollover),
    has_exception: Boolean(row.has_exception),
    date_advertised: (row.date_advertised as string) ?? null,
    date_closed: (row.date_closed as string) ?? null,
    date_eval_sent_mtb_rtb: (row.date_eval_sent_mtb_rtb as string) ?? null,
    date_eval_sent_nptab: (row.date_eval_sent_nptab as string) ?? null,
    date_of_award: (row.date_of_award as string) ?? null,
    contractor: (row.contractor as string) ?? null,
    implementation_start_date: (row.implementation_start_date as string) ?? null,
    implementation_end_date: (row.implementation_end_date as string) ?? null,
    implementation_status_pct: (row.implementation_status_pct as number) ?? null,
    remarks: (row.remarks as string) ?? null,
    missing_from_last_upload: Boolean(row.missing_from_last_upload),
    first_seen_upload_id: (row.first_seen_upload_id as string) ?? null,
    last_seen_upload_id: (row.last_seen_upload_id as string) ?? null,
    awarded_at: (row.awarded_at as string) ?? null,
    first_appearance_already_awarded: Boolean(row.first_appearance_already_awarded),
    archived_at: (row.archived_at as string) ?? null,
    archived_by: (row.archived_by as string) ?? null,
    archived_role: (row.archived_role as string) ?? null,
    archive_reason_code: (row.archive_reason_code as ArchiveReasonCode) ?? null,
    archive_reason_text: (row.archive_reason_text as string) ?? null,
    created_by: (row.created_by as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    agency_name: agencyName(row.agency as string),
    days_at_current_stage: computeDaysInStage(stage, {
      date_advertised: row.date_advertised as string | null,
      date_closed: row.date_closed as string | null,
      date_eval_sent_mtb_rtb: row.date_eval_sent_mtb_rtb as string | null,
      date_eval_sent_nptab: row.date_eval_sent_nptab as string | null,
      is_rollover: Boolean(row.is_rollover),
      has_exception: Boolean(row.has_exception),
    }),
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listTenders(
  opts: { agency?: string; includeMissing?: boolean; includeRollovers?: boolean; includeArchived?: boolean } = {},
): Promise<Tender[]> {
  let query = supabaseAdmin
    .from('tender')
    .select(TENDER_COLUMNS)
    .order('updated_at', { ascending: false });

  if (opts.agency) {
    query = query.eq('agency', opts.agency.toUpperCase());
  }
  if (!opts.includeMissing) {
    query = query.eq('missing_from_last_upload', false);
  }
  // Rollovers are prior-year awards under execution — contracts, not tenders.
  // Excluded from the pipeline tracker by default; admin/debug views opt in.
  if (!opts.includeRollovers) {
    query = query.eq('is_rollover', false);
  }
  // Archived tenders never appear in active surfaces — only in /procurement/archived.
  if (!opts.includeArchived) {
    query = query.is('archived_at', null);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as unknown as Record<string, unknown>[];
  return rows.map((r) => enrichTender(r));
}

export async function getTenderById(id: string): Promise<
  (Tender & { field_changes: TenderFieldChange[]; documents: TenderDocument[]; notes: TenderNote[] }) | null
> {
  const [tenderResult, changesResult, docsResult, notesResult] = await Promise.all([
    supabaseAdmin.from('tender').select(TENDER_COLUMNS).eq('id', id).single(),
    supabaseAdmin
      .from('tender_field_change')
      .select('id, tender_id, field_name, old_value, new_value, upload_id, changed_by, changed_at, changer:users!tender_field_change_changed_by_fkey(name)')
      .eq('tender_id', id)
      .order('changed_at', { ascending: false }),
    supabaseAdmin
      .from('tender_document')
      .select('id, tender_id, file_name, file_path, file_type, uploaded_by, uploaded_at, uploader:users!tender_document_uploaded_by_fkey(name)')
      .eq('tender_id', id)
      .order('uploaded_at', { ascending: false }),
    supabaseAdmin
      .from('tender_note')
      .select('id, tender_id, content, created_by, created_at, author:users!tender_note_created_by_fkey(name)')
      .eq('tender_id', id)
      .order('created_at', { ascending: false }),
  ]);

  if (tenderResult.error || !tenderResult.data) return null;

  const row = tenderResult.data as unknown as Record<string, unknown>;
  const changes = (changesResult.data || []) as unknown as Record<string, unknown>[];
  const tender = enrichTender(row);

  const field_changes: TenderFieldChange[] = changes.map((c) => ({
    id: c.id as string,
    tender_id: c.tender_id as string,
    field_name: c.field_name as string,
    old_value: c.old_value,
    new_value: c.new_value,
    upload_id: (c.upload_id as string) ?? null,
    changed_by: (c.changed_by as string) ?? null,
    changed_by_name: c.changed_by ? resolveJoinedName(c.changer) : null,
    changed_at: c.changed_at as string,
  }));

  const documents: TenderDocument[] = (docsResult.data || []).map((d: Record<string, unknown>) => ({
    id: d.id as string,
    tender_id: d.tender_id as string,
    file_name: d.file_name as string,
    file_path: d.file_path as string,
    file_type: (d.file_type as string) ?? null,
    uploaded_by: d.uploaded_by as string,
    uploaded_by_name: resolveJoinedName(d.uploader),
    uploaded_at: d.uploaded_at as string,
  }));

  const notes: TenderNote[] = (notesResult.data || []).map((n: Record<string, unknown>) => ({
    id: n.id as string,
    tender_id: n.tender_id as string,
    content: n.content as string,
    created_by: n.created_by as string,
    created_by_name: resolveJoinedName(n.author),
    created_at: n.created_at as string,
  }));

  return { ...tender, field_changes, documents, notes };
}

export async function createManualTender(input: {
  description: string;
  agency: TenderAgency;
  stage: TenderStage;
  method: TenderMethod;
  date_of_award: string;
  line_item_code?: string;
  programme_code?: string;
  sub_programme_code?: string;
  programme_activity?: string;
  date_advertised?: string;
  date_closed?: string;
  date_eval_sent_mtb_rtb?: string;
  date_eval_sent_nptab?: string;
  contractor?: string;
  implementation_start_date?: string;
  implementation_end_date?: string;
  implementation_status_pct?: number;
  is_rollover?: boolean;
  has_exception?: boolean;
  remarks?: string;
  created_by: string;
}): Promise<Tender> {
  // Award-tracking: manual creation at stage=award stamps awarded_at=now
  // and flags first_appearance_already_awarded (we can't know the real
  // transition date for a manually-logged award).
  const nowIso = new Date().toISOString();
  const alreadyAwarded = input.stage === 'award';

  const { data, error } = await supabaseAdmin
    .from('tender')
    .insert({
      source: 'manual',
      description: input.description.trim(),
      agency: input.agency,
      line_item_code: input.line_item_code ?? null,
      programme_code: input.programme_code ?? null,
      sub_programme_code: input.sub_programme_code ?? null,
      programme_activity: input.programme_activity ?? null,
      stage: input.stage,
      stage_source: 'manual_override',
      method: input.method,
      is_rollover: input.is_rollover ?? false,
      has_exception: input.has_exception ?? false,
      date_advertised: input.date_advertised ?? null,
      date_closed: input.date_closed ?? null,
      date_eval_sent_mtb_rtb: input.date_eval_sent_mtb_rtb ?? null,
      date_eval_sent_nptab: input.date_eval_sent_nptab ?? null,
      date_of_award: input.date_of_award,
      contractor: input.contractor ?? null,
      implementation_start_date: input.implementation_start_date ?? null,
      implementation_end_date: input.implementation_end_date ?? null,
      implementation_status_pct: input.implementation_status_pct ?? null,
      remarks: input.remarks ?? null,
      awarded_at: alreadyAwarded ? nowIso : null,
      first_appearance_already_awarded: alreadyAwarded,
      created_by: input.created_by,
    })
    .select(TENDER_COLUMNS)
    .single();

  if (error) throw error;

  const tender = enrichTender(data as unknown as Record<string, unknown>);
  const changes: Array<Record<string, unknown>> = [
    {
      tender_id: tender.id,
      field_name: '__created',
      old_value: null,
      new_value: { source: 'manual', stage: tender.stage, agency: tender.agency },
      upload_id: null,
      changed_by: input.created_by,
    },
  ];
  if (alreadyAwarded) {
    changes.push({
      tender_id: tender.id,
      field_name: 'awarded_at',
      old_value: null,
      new_value: nowIso,
      upload_id: null,
      changed_by: input.created_by,
    });
  }
  await supabaseAdmin.from('tender_field_change').insert(changes);
  return tender;
}

export async function updateTenderStage(
  tenderId: string,
  newStage: TenderStage,
  userId: string,
  note?: string,
): Promise<Tender> {
  const { data: current, error: fetchError } = await supabaseAdmin
    .from('tender')
    .select('stage, awarded_at')
    .eq('id', tenderId)
    .single();
  if (fetchError || !current) throw fetchError || new Error('Tender not found');

  const fromStage = current.stage as TenderStage;
  if (fromStage === newStage) {
    const again = await supabaseAdmin.from('tender').select(TENDER_COLUMNS).eq('id', tenderId).single();
    if (again.error || !again.data) throw again.error || new Error('Tender not found');
    return enrichTender(again.data as unknown as Record<string, unknown>);
  }

  // Award-tracking on manual advance: stamp awarded_at on first transition
  // into award; never overwrite if already set.
  const existingAwardedAt = (current.awarded_at as string | null) ?? null;
  const transitioningToAward = newStage === 'award' && fromStage !== 'award' && !existingAwardedAt;
  const nowIso = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    stage: newStage,
    stage_source: 'manual_override',
  };
  if (transitioningToAward) updatePayload.awarded_at = nowIso;

  const [updateResult] = await Promise.all([
    supabaseAdmin
      .from('tender')
      .update(updatePayload)
      .eq('id', tenderId)
      .select(TENDER_COLUMNS)
      .single(),
    supabaseAdmin.from('tender_field_change').insert({
      tender_id: tenderId,
      field_name: 'stage',
      old_value: fromStage,
      new_value: newStage,
      upload_id: null,
      changed_by: userId,
    }),
  ]);
  if (updateResult.error) throw updateResult.error;
  if (transitioningToAward) {
    await supabaseAdmin.from('tender_field_change').insert({
      tender_id: tenderId,
      field_name: 'awarded_at',
      old_value: null,
      new_value: nowIso,
      upload_id: null,
      changed_by: userId,
    });
  }
  const row = updateResult.data as unknown as Record<string, unknown>;
  return enrichTender(row);

  // Note: `note` is currently unused; reserved for the optional change annotation
  //       in a future iteration. Silencing lint via an explicit use below.
  void note;
}

export async function deleteTender(tenderId: string): Promise<void> {
  const { data: docs } = await supabaseAdmin
    .from('tender_document')
    .select('file_path')
    .eq('tender_id', tenderId);

  const paths = (docs || []).map((d) => d.file_path as string).filter(Boolean);
  if (paths.length > 0) {
    await supabaseAdmin.storage.from('tender-documents').remove(paths).catch((err) => {
      logger.warn({ err, tenderId }, 'tender: failed to clean up storage on delete');
    });
  }
  const { error } = await supabaseAdmin.from('tender').delete().eq('id', tenderId);
  if (error) throw error;
}

export async function addTenderNote(tenderId: string, content: string, userId: string): Promise<TenderNote> {
  const { data, error } = await supabaseAdmin
    .from('tender_note')
    .insert({ tender_id: tenderId, content, created_by: userId })
    .select('id, tender_id, content, created_by, created_at, author:users!tender_note_created_by_fkey(name)')
    .single();
  if (error) throw error;
  const row = data as unknown as Record<string, unknown>;
  return {
    id: row.id as string,
    tender_id: row.tender_id as string,
    content: row.content as string,
    created_by: row.created_by as string,
    created_by_name: resolveJoinedName(row.author),
    created_at: row.created_at as string,
  };
}

export async function addTenderDocument(input: {
  tenderId: string;
  fileName: string;
  filePath: string;
  fileType: string | null;
  userId: string;
}): Promise<TenderDocument> {
  const { data, error } = await supabaseAdmin
    .from('tender_document')
    .insert({
      tender_id: input.tenderId,
      file_name: input.fileName,
      file_path: input.filePath,
      file_type: input.fileType,
      uploaded_by: input.userId,
    })
    .select('id, tender_id, file_name, file_path, file_type, uploaded_by, uploaded_at, uploader:users!tender_document_uploaded_by_fkey(name)')
    .single();
  if (error) throw error;
  const row = data as unknown as Record<string, unknown>;
  return {
    id: row.id as string,
    tender_id: row.tender_id as string,
    file_name: row.file_name as string,
    file_path: row.file_path as string,
    file_type: (row.file_type as string) ?? null,
    uploaded_by: row.uploaded_by as string,
    uploaded_by_name: resolveJoinedName(row.uploader),
    uploaded_at: row.uploaded_at as string,
  };
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getPipelineStats(agency?: string): Promise<PipelineStats> {
  let query = supabaseAdmin
    .from('tender')
    .select('id, stage, created_at, updated_at, date_of_award, missing_from_last_upload');

  if (agency) query = query.eq('agency', agency.toUpperCase());
  query = query.eq('missing_from_last_upload', false);
  query = query.eq('is_rollover', false);
  query = query.is('archived_at', null);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data || [];
  const byStage = Object.fromEntries(TENDER_STAGES.map((s) => [s, { count: 0 }])) as PipelineStats['by_stage'];
  let totalActive = 0;
  let stalledCount = 0;
  const awardedDays: number[] = [];

  for (const r of rows) {
    const s = r.stage as TenderStage;
    byStage[s].count++;
    if (s !== 'award') totalActive++;

    const days = computeDaysSince(r.updated_at as string);
    if (s !== 'award' && days > STALLED_THRESHOLD_DAYS) stalledCount++;

    if (s === 'award' && r.date_of_award) {
      const created = new Date(r.created_at as string).getTime();
      const awarded = new Date(r.date_of_award as string).getTime();
      if (!Number.isNaN(created) && !Number.isNaN(awarded) && awarded >= created) {
        awardedDays.push(Math.floor((awarded - created) / (1000 * 60 * 60 * 24)));
      }
    }
  }

  const avgDaysToAward = awardedDays.length > 0
    ? Math.round(awardedDays.reduce((a, b) => a + b, 0) / awardedDays.length)
    : 0;

  return {
    total_active: totalActive,
    total_count: rows.length,
    avg_days_to_award: avgDaysToAward,
    stalled_count: stalledCount,
    by_stage: byStage,
  };
}

// ── Missing & review ──────────────────────────────────────────────────────────

export async function listMissingTenders(agency?: string): Promise<Tender[]> {
  return listTenders({ agency, includeMissing: true, includeRollovers: true }).then((all) =>
    all.filter((t) => t.missing_from_last_upload),
  );
}

// ── Awarded archive + banner ──────────────────────────────────────────────────

export interface AwardedSince {
  // Timestamp of the upload treated as "previous" — everything awarded after
  // this point counts. Null when there isn't a comparable previous upload
  // (first upload ever, or no uploads yet).
  previous_upload_at: string | null;
  previous_upload_id: string | null;
  // Count and list of awarded tenders whose awarded_at is strictly AFTER
  // previous_upload_at. When previous_upload_at is null the count is 0 and
  // the UI should fall back to rendering the current-awarded total (see
  // `getPipelineStats`).
  count: number;
  tenders: Tender[];
}

export async function getAwardedSinceLastUpload(opts: { agency?: string } = {}): Promise<AwardedSince> {
  // Pick the 2nd-most-recent applied upload as the reference. If only one
  // applied upload exists, we have no "since" benchmark — return null so
  // the UI renders a static total.
  const { data: uploads } = await supabaseAdmin
    .from('upload')
    .select('id, uploaded_at')
    .eq('status', 'applied')
    .order('uploaded_at', { ascending: false })
    .limit(2);
  const list = (uploads || []) as Array<{ id: string; uploaded_at: string }>;
  if (list.length < 2) {
    return { previous_upload_at: null, previous_upload_id: null, count: 0, tenders: [] };
  }
  const ref = list[1];

  let query = supabaseAdmin
    .from('tender')
    .select(TENDER_COLUMNS)
    .eq('stage', 'award')
    .is('archived_at', null)
    .gt('awarded_at', ref.uploaded_at)
    .order('awarded_at', { ascending: false });
  if (opts.agency) query = query.eq('agency', opts.agency.toUpperCase());

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []) as unknown as Record<string, unknown>[];
  const tenders = rows.map((r) => enrichTender(r));
  return {
    previous_upload_at: ref.uploaded_at,
    previous_upload_id: ref.id,
    count: tenders.length,
    tenders,
  };
}

export async function listAwardedTenders(opts: { agency?: string } = {}): Promise<Tender[]> {
  let query = supabaseAdmin
    .from('tender')
    .select(TENDER_COLUMNS)
    .eq('stage', 'award')
    .eq('missing_from_last_upload', false)
    .is('archived_at', null)
    .order('awarded_at', { ascending: false, nullsFirst: false });
  if (opts.agency) query = query.eq('agency', opts.agency.toUpperCase());
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []) as unknown as Record<string, unknown>[];
  return rows.map((r) => enrichTender(r));
}

// ── Soft archive ──────────────────────────────────────────────────────────────

export async function listArchivedTenders(opts: { agency?: string } = {}): Promise<Tender[]> {
  let query = supabaseAdmin
    .from('tender')
    .select(TENDER_COLUMNS)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });
  if (opts.agency) query = query.eq('agency', opts.agency.toUpperCase());
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []) as unknown as Record<string, unknown>[];
  return rows.map((r) => enrichTender(r));
}

export async function archiveTender(input: {
  tenderId: string;
  reasonCode: ArchiveReasonCode;
  reasonText?: string | null;
  actorId: string;
  actorRole: string;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('tender')
    .update({
      archived_at: new Date().toISOString(),
      archived_by: input.actorId,
      archived_role: input.actorRole,
      archive_reason_code: input.reasonCode,
      archive_reason_text: input.reasonText ?? null,
    })
    .eq('id', input.tenderId)
    .is('archived_at', null);
  if (error) throw error;
}

export async function unarchiveTender(tenderId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('tender')
    .update({
      archived_at: null,
      archived_by: null,
      archived_role: null,
      archive_reason_code: null,
      archive_reason_text: null,
    })
    .eq('id', tenderId);
  if (error) throw error;
}
