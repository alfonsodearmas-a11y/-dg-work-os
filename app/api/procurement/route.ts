import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { MINISTRY_ROLES } from '@/lib/people-types';
import { listTenders, createManualTender, getPipelineStats, getAwardedSinceLastUpload } from '@/lib/tender/queries';
import {
  AGENCY_CODES,
  METHOD_CONFIG,
  TENDER_STAGES,
  type TenderAgency,
  type TenderMethod,
  type TenderStage,
} from '@/lib/tender/types';
import { LINE_ITEM_CODE_RE } from '@/lib/psip/parser';
import { logger } from '@/lib/logger';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type FieldErrors = Record<string, string>;

export async function GET() {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const isMinistry = MINISTRY_ROLES.includes(session.user.role);
    const agencyFilter = isMinistry ? undefined : session.user.agency ?? undefined;

    const [tenders, stats, awardedSince] = await Promise.all([
      listTenders({ agency: agencyFilter }),
      getPipelineStats(agencyFilter),
      getAwardedSinceLastUpload({ agency: agencyFilter }),
    ]);

    return NextResponse.json({ tenders, stats, awarded_since: awardedSince });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? '';
    const msg = (err as { message?: string })?.message ?? '';
    const isSchemaIssue =
      code === '42P01' || code === '42703' || code === 'PGRST200' || code === 'PGRST205' ||
      msg.includes('schema cache') || msg.includes('does not exist');
    if (isSchemaIssue) {
      logger.warn({ code, message: msg }, 'Tender schema issue (migrations may not be applied)');
      return NextResponse.json({ tenders: [], stats: null });
    }
    logger.error({ err }, 'Error fetching tenders');
    return NextResponse.json({ error: 'Failed to load tenders' }, { status: 500 });
  }
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function validateDate(field: string, value: unknown, errors: FieldErrors): string | undefined {
  const s = trimOrUndef(value);
  if (!s) return undefined;
  if (!ISO_DATE_RE.test(s) || Number.isNaN(Date.parse(s))) {
    errors[field] = 'Must be a valid date';
    return undefined;
  }
  return s;
}

export async function POST(request: NextRequest) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const errors: FieldErrors = {};

    const description = trimOrUndef(body.description);
    if (!description) errors.description = 'Description is required';

    // Agency-scoped users can never create for another agency, regardless of
    // what the body says — overwrite with their session agency.
    const isAgencyScoped = session.user.role === 'agency_admin' || session.user.role === 'officer';
    const rawAgency = isAgencyScoped ? session.user.agency : trimOrUndef(body.agency);
    const agencyUpper = (rawAgency || '').toUpperCase() as TenderAgency;
    if (!AGENCY_CODES.includes(agencyUpper)) errors.agency = 'A valid agency is required';

    const rawStage = trimOrUndef(body.stage) as TenderStage | undefined;
    if (!rawStage) errors.stage = 'Stage is required';
    else if (!TENDER_STAGES.includes(rawStage)) errors.stage = 'Invalid stage';

    const rawMethod = trimOrUndef(body.method) as TenderMethod | undefined;
    if (!rawMethod) errors.method = 'Procurement method is required';
    else if (!(rawMethod in METHOD_CONFIG)) errors.method = 'Invalid procurement method';

    const dateOfAward = validateDate('date_of_award', body.date_of_award, errors);
    if (!errors.date_of_award && !dateOfAward) errors.date_of_award = 'Expected award date is required';

    const dateAdvertised = validateDate('date_advertised', body.date_advertised, errors);
    const dateClosed = validateDate('date_closed', body.date_closed, errors);
    const dateEvalMtbRtb = validateDate('date_eval_sent_mtb_rtb', body.date_eval_sent_mtb_rtb, errors);
    const dateEvalNptab = validateDate('date_eval_sent_nptab', body.date_eval_sent_nptab, errors);
    const implStart = validateDate('implementation_start_date', body.implementation_start_date, errors);
    const implEnd = validateDate('implementation_end_date', body.implementation_end_date, errors);

    const lineItemCode = trimOrUndef(body.line_item_code);
    if (lineItemCode && !LINE_ITEM_CODE_RE.test(lineItemCode)) {
      errors.line_item_code = 'Must look like H-123, C-45, U-9, or PO-1234';
    }

    let implPct: number | undefined;
    if (body.implementation_status_pct !== undefined && body.implementation_status_pct !== null && body.implementation_status_pct !== '') {
      const n = typeof body.implementation_status_pct === 'number'
        ? body.implementation_status_pct
        : Number(body.implementation_status_pct);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        errors.implementation_status_pct = 'Must be a number between 0 and 100';
      } else {
        implPct = Math.round(n);
      }
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 422 });
    }

    const tender = await createManualTender({
      description: description!,
      agency: agencyUpper,
      stage: rawStage!,
      method: rawMethod!,
      date_of_award: dateOfAward!,
      line_item_code: lineItemCode,
      programme_code: trimOrUndef(body.programme_code),
      sub_programme_code: trimOrUndef(body.sub_programme_code),
      programme_activity: trimOrUndef(body.programme_activity),
      date_advertised: dateAdvertised,
      date_closed: dateClosed,
      date_eval_sent_mtb_rtb: dateEvalMtbRtb,
      date_eval_sent_nptab: dateEvalNptab,
      contractor: trimOrUndef(body.contractor),
      implementation_start_date: implStart,
      implementation_end_date: implEnd,
      implementation_status_pct: implPct,
      is_rollover: !!body.is_rollover,
      has_exception: !!body.has_exception,
      remarks: trimOrUndef(body.remarks),
      created_by: session.user.id,
    });

    return NextResponse.json({ tender }, { status: 201 });
  } catch (err: unknown) {
    logger.error({ err }, 'Error creating manual tender');
    return NextResponse.json({ error: 'Failed to create tender' }, { status: 500 });
  }
}
