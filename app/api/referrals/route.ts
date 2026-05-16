import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import {
  listReferrals,
  createReferralDraft,
  submitReferral,
  getReferralById,
  type CreateReferralInput,
} from '@/lib/referrals/queries';
import { renderReferralPDF } from '@/lib/pdf/referral-render';
import { supabaseAdmin } from '@/lib/db';
import { EmDashError } from '@/lib/referrals/em-dash-guard';
import {
  REFERRAL_SOURCE_TYPES,
  REFERRAL_REQUESTED_ACTIONS,
  REFERRAL_STATUSES,
  type ReferralStatus,
  type ReferralSourceType,
  type ReferralRequestedAction,
} from '@/lib/referrals/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

function parseStatusFilter(value: string | null): ReferralStatus[] | undefined {
  if (!value) return undefined;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ReferralStatus => (REFERRAL_STATUSES as readonly string[]).includes(s));
}

function parseAgencyFilter(value: string | null): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(['dg', 'ps']);
  if (auth instanceof NextResponse) return auth;

  try {
    const sp = request.nextUrl.searchParams;
    const filters = {
      status: parseStatusFilter(sp.get('status')),
      agency: parseAgencyFilter(sp.get('agency')),
      dateFrom: sp.get('from') ?? undefined,
      dateTo: sp.get('to') ?? undefined,
    };
    const referrals = await listReferrals(filters);
    return NextResponse.json({ referrals });
  } catch (err) {
    logger.error({ err }, 'GET /api/referrals failed');
    return NextResponse.json({ error: 'Failed to list referrals' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action;
  if (action !== 'draft' && action !== 'submit') {
    return NextResponse.json({ error: "action must be 'draft' or 'submit'" }, { status: 400 });
  }

  const source_type = body.source_type as ReferralSourceType;
  const requested_action = body.requested_action as ReferralRequestedAction;
  if (!(REFERRAL_SOURCE_TYPES as readonly string[]).includes(source_type)) {
    return NextResponse.json({ error: 'Invalid source_type' }, { status: 400 });
  }
  if (!(REFERRAL_REQUESTED_ACTIONS as readonly string[]).includes(requested_action)) {
    return NextResponse.json({ error: 'Invalid requested_action' }, { status: 400 });
  }
  if (typeof body.agency !== 'string' || !body.agency.trim()) {
    return NextResponse.json({ error: 'agency is required' }, { status: 400 });
  }
  if (typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (typeof body.recommendation !== 'string') {
    return NextResponse.json({ error: 'recommendation is required' }, { status: 400 });
  }
  if (action === 'submit' && body.recommendation.trim().length < 50) {
    return NextResponse.json(
      { error: 'Recommendation must be at least 50 characters to submit' },
      { status: 422 },
    );
  }

  const input: CreateReferralInput = {
    source_type,
    source_id: typeof body.source_id === 'string' ? body.source_id : null,
    agency: body.agency.toUpperCase(),
    title: body.title,
    days_overdue: typeof body.days_overdue === 'number' ? body.days_overdue : null,
    contract_value: typeof body.contract_value === 'number' ? body.contract_value : null,
    background: typeof body.background === 'string' ? body.background : '',
    current_status: typeof body.current_status === 'string' ? body.current_status : '',
    recommendation: body.recommendation,
    requested_action,
  };

  try {
    const draft = await createReferralDraft(input, session.user.id);
    if (action === 'draft') {
      return NextResponse.json({ referral: draft });
    }
    // Submit path: needs the user's name + title for the PDF signature.
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('name, formal_title')
      .eq('id', session.user.id)
      .single();
    const referrerName = userRow?.name ?? 'Director General';
    const referrerTitle =
      userRow?.formal_title ?? 'Director General, Ministry of Public Utilities and Aviation';

    const submitted = await submitReferral(draft.id, session.user.id, async (r) =>
      renderReferralPDF({ referral: r, referrerName, referrerTitle }),
    );
    const full = await getReferralById(submitted.id);
    return NextResponse.json({
      referral: full ?? submitted,
      pdfUrl: `/api/referrals/${submitted.id}/pdf`,
    });
  } catch (err) {
    if (err instanceof EmDashError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    logger.error({ err }, 'POST /api/referrals failed');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
