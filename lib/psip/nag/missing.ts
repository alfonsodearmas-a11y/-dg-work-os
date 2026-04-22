// ── Missing-dates detection shared between Today signal + nag pipeline ──────
//
// Mirrors the filter rules used by lib/today/signals.ts but returns the
// full per-tender list (not just per-agency counts) since the nag
// compose step needs description, stage, and the specific missing field
// name for each row.

import { supabaseAdmin } from '@/lib/db';

export interface MissingTenderRow {
  id: string;
  agency: string;
  stage: 'advertised' | 'evaluation' | 'awaiting_award';
  description: string;
  created_at: string;
  missing_field: 'date_advertised' | 'date_closed' | 'date_eval_sent';
}

function missingFieldFor(row: {
  stage: string;
  date_advertised: string | null;
  date_closed: string | null;
  date_eval_sent_mtb_rtb: string | null;
  date_eval_sent_nptab: string | null;
}): MissingTenderRow['missing_field'] | null {
  switch (row.stage) {
    case 'advertised':
      return row.date_advertised === null ? 'date_advertised' : null;
    case 'evaluation':
      return row.date_closed === null ? 'date_closed' : null;
    case 'awaiting_award':
      return row.date_eval_sent_nptab === null
        && row.date_eval_sent_mtb_rtb === null
        && row.date_closed === null
        ? 'date_eval_sent'
        : null;
    default:
      return null;
  }
}

export async function fetchMissingTenders(agency?: string): Promise<MissingTenderRow[]> {
  let q = supabaseAdmin
    .from('tender')
    .select('id, agency, stage, description, created_at, date_advertised, date_closed, date_eval_sent_mtb_rtb, date_eval_sent_nptab')
    .in('stage', ['advertised', 'evaluation', 'awaiting_award'])
    .eq('is_rollover', false)
    .eq('has_exception', false)
    .eq('missing_from_last_upload', false);
  if (agency) q = q.eq('agency', agency.toUpperCase());
  const { data, error } = await q;
  if (error) throw error;

  const out: MissingTenderRow[] = [];
  for (const r of data || []) {
    const row = r as typeof r & {
      stage: string;
      date_advertised: string | null;
      date_closed: string | null;
      date_eval_sent_mtb_rtb: string | null;
      date_eval_sent_nptab: string | null;
    };
    const missing_field = missingFieldFor(row);
    if (!missing_field) continue;
    out.push({
      id: row.id as string,
      agency: row.agency as string,
      stage: row.stage as MissingTenderRow['stage'],
      description: row.description as string,
      created_at: row.created_at as string,
      missing_field,
    });
  }
  return out;
}

export function groupByAgency(rows: MissingTenderRow[]): Map<string, MissingTenderRow[]> {
  const map = new Map<string, MissingTenderRow[]>();
  for (const r of rows) {
    const bucket = map.get(r.agency) ?? [];
    bucket.push(r);
    map.set(r.agency, bucket);
  }
  return map;
}

export const MISSING_FIELD_LABEL: Record<MissingTenderRow['missing_field'], string> = {
  date_advertised: 'Tender Advertised (PSIP col E)',
  date_closed: 'Tender Closed (PSIP col F)',
  date_eval_sent: 'Date Eval Sent for Approval (PSIP col G or H)',
};

export const STAGE_LABEL: Record<MissingTenderRow['stage'], string> = {
  advertised: 'Advertised',
  evaluation: 'Evaluation',
  awaiting_award: 'Awaiting Award',
};
