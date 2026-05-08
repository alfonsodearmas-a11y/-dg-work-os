import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Critical-tender selection logic for the per-agency intel page.
 *
 * "Critical" is the union of three conditions:
 *   1. tender.status = 'missing_pending_decision' (agency must decide what
 *      happened to a tender that disappeared from the latest PSIP upload).
 *   2. tender.stage = 'awaiting_award' AND date_of_award IS NULL AND
 *      date_advertised < (now - 60 days). Award stage is the choke point.
 *   3. tender.source = 'psip' AND missing_from_last_upload = true (legacy
 *      flag — overlaps with #1 in most cases but covers tenders whose
 *      status row hasn't been transitioned yet).
 *
 * Returned rows include `days_in_stage` computed from the most recent stage
 * date column, sorted descending so the longest-stuck show first.
 */

export type TenderStage =
  | 'design'
  | 'advertised'
  | 'evaluation'
  | 'awaiting_award'
  | 'award';

export interface CriticalTenderRow {
  id: string;
  agency: string;
  description: string;
  stage: TenderStage;
  status: string;
  source: string;
  contractor: string | null;
  implementation_status_pct: number | null;
  date_advertised: string | null;
  date_closed: string | null;
  date_eval_sent_mtb_rtb: string | null;
  date_eval_sent_nptab: string | null;
  date_of_award: string | null;
  missing_from_last_upload: boolean;

  // Computed
  days_in_stage: number | null;
  next_action_owner: string | null;
  reason: 'missing_pending_decision' | 'stale_award' | 'missing_from_upload';
}

const STALE_AWARD_DAYS = 60;

/**
 * Map a DG-Work-OS agency slug or display code to the value stored in the
 * `tender_agency` enum. The enum uses `HINTERLAND_AIRSTRIPS` instead of
 * `HAS`; every other agency maps to its uppercase code.
 *
 * Wrong mapping is a hard error (`invalid input value for enum tender_agency`)
 * that fails the entire query — including any IN-list it appears in — so this
 * helper has to be the single chokepoint for tender-table reads.
 */
export function toTenderAgency(agency: string): string {
  const upper = agency.toUpperCase();
  if (upper === 'HAS') return 'HINTERLAND_AIRSTRIPS';
  return upper;
}

const TENDER_COLUMNS = [
  'id',
  'agency',
  'description',
  'stage',
  'status',
  'source',
  'contractor',
  'implementation_status_pct',
  'date_advertised',
  'date_closed',
  'date_eval_sent_mtb_rtb',
  'date_eval_sent_nptab',
  'date_of_award',
  'missing_from_last_upload',
  'updated_at',
].join(',');

/** Pick the most recent date column relevant to the current stage. */
function stageEnteredAt(t: {
  stage: string;
  date_advertised: string | null;
  date_closed: string | null;
  date_eval_sent_mtb_rtb: string | null;
  date_eval_sent_nptab: string | null;
  date_of_award: string | null;
}): string | null {
  switch (t.stage) {
    case 'advertised':
      return t.date_advertised;
    case 'evaluation':
      return t.date_closed ?? t.date_advertised;
    case 'awaiting_award':
      return (
        t.date_eval_sent_nptab ?? t.date_eval_sent_mtb_rtb ?? t.date_closed
      );
    case 'award':
      return t.date_of_award;
    case 'design':
    default:
      return null;
  }
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr);
  if (Number.isNaN(t.getTime())) return null;
  return Math.floor((Date.now() - t.getTime()) / 86_400_000);
}

/**
 * Lookup map of agency → focal-point/agency-head names so the per-agency
 * intel page can show a "Next action: {name}" hint without an extra round
 * trip per row.
 */
async function getNextActionMap(
  agency: string,
): Promise<{ focal: string | null; head: string | null }> {
  const { data, error } = await supabaseAdmin
    .from('agency_psip_focal_point')
    .select('focal_point_name, agency_head_name')
    .eq('agency', agency)
    .maybeSingle();
  if (error) {
    logger.warn(
      { err: error, agency },
      'getCriticalTendersForAgency: focal-point lookup failed',
    );
    return { focal: null, head: null };
  }
  return {
    focal: data?.focal_point_name || null,
    head: data?.agency_head_name || null,
  };
}

/**
 * Fetch all "critical" tenders for the given agency. Agency is normalized
 * UPPERCASE to match the tender_agency enum. Returns rows already enriched
 * with days_in_stage, next_action_owner, and a reason tag, sorted by
 * days_in_stage desc (longest-stuck first).
 */
export async function getCriticalTendersForAgency(
  agency: string,
): Promise<CriticalTenderRow[]> {
  // tender.agency is the `tender_agency` enum; agency_psip_focal_point.agency
  // is plain text and uses the DG-Work-OS slug uppercase. Keep them separate.
  const tenderAgency = toTenderAgency(agency);
  const focalAgency = agency.toUpperCase();
  const staleCutoff = new Date(
    Date.now() - STALE_AWARD_DAYS * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

  // One query covering all three reasons. Post-classification happens in JS.
  const { data, error } = await supabaseAdmin
    .from('tender')
    .select(TENDER_COLUMNS)
    .eq('agency', tenderAgency)
    .or(
      [
        `status.eq.missing_pending_decision`,
        `missing_from_last_upload.eq.true`,
        // Stale award: stage filter + date filter run client-side below
        `stage.eq.awaiting_award`,
      ].join(','),
    );

  if (error) {
    logger.error(
      { err: error, agency: tenderAgency },
      'getCriticalTendersForAgency: query failed',
    );
    return [];
  }

  const action = await getNextActionMap(focalAgency);
  const nextOwner = action.focal || action.head;

  const rows: CriticalTenderRow[] = [];
  type RawRow = Omit<CriticalTenderRow, 'days_in_stage' | 'next_action_owner' | 'reason'> & {
    stage: string;
  };
  const dataRows = ((data ?? []) as unknown) as RawRow[];
  for (const r of dataRows) {
    let reason: CriticalTenderRow['reason'] | null = null;
    if (r.status === 'missing_pending_decision') {
      reason = 'missing_pending_decision';
    } else if (r.source === 'psip' && r.missing_from_last_upload) {
      reason = 'missing_from_upload';
    } else if (
      r.stage === 'awaiting_award' &&
      !r.date_of_award &&
      r.date_advertised &&
      r.date_advertised < staleCutoff
    ) {
      reason = 'stale_award';
    }
    if (!reason) continue;

    const enteredAt = stageEnteredAt(r);
    rows.push({
      ...r,
      stage: r.stage as TenderStage,
      days_in_stage: daysSince(enteredAt),
      next_action_owner: nextOwner,
      reason,
    });
  }

  // Sort: longest-stuck first; nulls last
  rows.sort((a, b) => {
    const ad = a.days_in_stage ?? -1;
    const bd = b.days_in_stage ?? -1;
    return bd - ad;
  });

  return rows;
}

// ---------------------------------------------------------------------------
// Tenders in Evaluation — bids closed, awaiting TEC/NPTAB recommendation.
// Distinct from "critical": evaluation is the normal pipeline state, not a
// dysfunction. Surfaced separately so the DG can see NPTAB cadence at a
// glance without conflating it with stuck-award and missing-tender cases.
//
// Day thresholds are exported so the per-agency card, the batched summary
// endpoint, and the /intel index picker classifier all use the same numbers.
// ---------------------------------------------------------------------------

export const EVAL_WARN_DAYS = 14;
export const EVAL_DANGER_DAYS = 30;

/** Internal helper used by both the per-agency query and the batched
 *  summary endpoint. Returns days-in-stage given the relevant date columns. */
export function evaluationDaysInStage(t: {
  date_closed: string | null;
  date_advertised: string | null;
}): number | null {
  return daysSince(t.date_closed ?? t.date_advertised);
}

export interface EvaluationTenderRow {
  id: string;
  description: string;
  sub_programme_code: string | null;
  sub_programme_name: string | null;
  date_closed: string | null;
  date_advertised: string | null;
  date_eval_sent_mtb_rtb: string | null;
  date_eval_sent_nptab: string | null;
  contractor: string | null;
  days_in_stage: number | null;
  next_action_owner: string | null;
}

export async function getEvaluationTendersForAgency(
  agency: string,
): Promise<EvaluationTenderRow[]> {
  const tenderAgency = toTenderAgency(agency);
  const focalAgency = agency.toUpperCase();

  const { data, error } = await supabaseAdmin
    .from('tender')
    .select(
      'id, description, sub_programme_code, contractor, date_advertised, date_closed, date_eval_sent_mtb_rtb, date_eval_sent_nptab, sub_programme:sub_programme(name)',
    )
    .eq('agency', tenderAgency)
    .eq('stage', 'evaluation')
    .limit(100);

  if (error) {
    logger.error(
      { err: error, agency: tenderAgency },
      'getEvaluationTendersForAgency: query failed',
    );
    return [];
  }

  const action = await getNextActionMap(focalAgency);
  const nextOwner = action.focal || action.head;

  type RawRow = {
    id: string;
    description: string;
    sub_programme_code: string | null;
    contractor: string | null;
    date_advertised: string | null;
    date_closed: string | null;
    date_eval_sent_mtb_rtb: string | null;
    date_eval_sent_nptab: string | null;
    sub_programme: { name: string } | { name: string }[] | null;
  };

  const rows: EvaluationTenderRow[] = (
    (data as unknown as RawRow[] | null) ?? []
  ).map((r) => {
    const subRel = r.sub_programme;
    const sub = Array.isArray(subRel) ? subRel[0] ?? null : subRel ?? null;
    return {
      id: r.id,
      description: r.description,
      sub_programme_code: r.sub_programme_code,
      sub_programme_name: sub?.name ?? null,
      date_closed: r.date_closed,
      date_advertised: r.date_advertised,
      date_eval_sent_mtb_rtb: r.date_eval_sent_mtb_rtb,
      date_eval_sent_nptab: r.date_eval_sent_nptab,
      contractor: r.contractor,
      days_in_stage: evaluationDaysInStage(r),
      next_action_owner: nextOwner,
    };
  });

  rows.sort((a, b) => {
    const ad = a.days_in_stage ?? -1;
    const bd = b.days_in_stage ?? -1;
    return bd - ad;
  });

  return rows;
}
