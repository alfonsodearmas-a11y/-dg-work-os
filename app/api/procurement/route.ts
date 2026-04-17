import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { MINISTRY_ROLES } from '@/lib/people-types';
import { listTenders, createManualTender, getPipelineStats } from '@/lib/tender/queries';
import {
  AGENCY_CODES,
  METHOD_CONFIG,
  TENDER_STAGES,
  type TenderAgency,
  type TenderMethod,
  type TenderStage,
} from '@/lib/tender/types';
import { logger } from '@/lib/logger';

export async function GET() {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const isMinistry = MINISTRY_ROLES.includes(session.user.role);
    const agencyFilter = isMinistry ? undefined : session.user.agency ?? undefined;

    const [tenders, stats] = await Promise.all([
      listTenders({ agency: agencyFilter }),
      getPipelineStats(agencyFilter),
    ]);

    return NextResponse.json({ tenders, stats });
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

export async function POST(request: NextRequest) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const body = await request.json();
    const {
      description,
      agency,
      programme_code,
      sub_programme_code,
      programme_activity,
      stage,
      method,
      is_rollover,
      has_exception,
      remarks,
    } = body as {
      description: string;
      agency?: string;
      programme_code?: string;
      sub_programme_code?: string;
      programme_activity?: string;
      stage?: string;
      method?: string;
      is_rollover?: boolean;
      has_exception?: boolean;
      remarks?: string;
    };

    if (!description?.trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }
    const resolvedAgency =
      session.user.role === 'agency_admin' ? session.user.agency : agency;
    const upper = (resolvedAgency || '').toUpperCase() as TenderAgency;
    if (!AGENCY_CODES.includes(upper)) {
      return NextResponse.json({ error: 'A valid agency is required' }, { status: 400 });
    }
    const resolvedStage = (stage || 'design') as TenderStage;
    if (!TENDER_STAGES.includes(resolvedStage)) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
    }
    const resolvedMethod = method ? (method as TenderMethod) : undefined;
    if (resolvedMethod && !(resolvedMethod in METHOD_CONFIG)) {
      return NextResponse.json({ error: 'Invalid procurement method' }, { status: 400 });
    }

    const tender = await createManualTender({
      description: description.trim(),
      agency: upper,
      programme_code: programme_code?.trim() || undefined,
      sub_programme_code: sub_programme_code?.trim() || undefined,
      programme_activity: programme_activity?.trim() || undefined,
      stage: resolvedStage,
      method: resolvedMethod,
      is_rollover: !!is_rollover,
      has_exception: !!has_exception,
      remarks: remarks?.trim() || undefined,
      created_by: session.user.id,
    });

    return NextResponse.json({ tender }, { status: 201 });
  } catch (err: unknown) {
    logger.error({ err }, 'Error creating manual tender');
    return NextResponse.json({ error: 'Failed to create tender' }, { status: 500 });
  }
}
