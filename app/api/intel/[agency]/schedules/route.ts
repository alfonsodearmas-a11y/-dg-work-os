import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { isIntelAgency } from '@/lib/agencies';
import { logger } from '@/lib/logger';
import { validateEmailList, parseEmailList } from '@/lib/email-validation';
import { computeNextRunAt, type Frequency } from '@/lib/intel/schedule-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  recipients: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .transform((v) => (Array.isArray(v) ? v : parseEmailList(v))),
  cover_message: z.string().max(2000).nullable().optional(),
  frequency: z.enum(['weekly', 'fortnightly', 'monthly']),
  day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  day_of_month: z.number().int().min(1).max(28).nullable().optional(),
  send_hour: z.number().int().min(0).max(23).optional(),
  template: z.enum(['plain', 'editorial']).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agency: string }> },
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { agency } = await params;
  const lower = agency.toLowerCase();
  if (!isIntelAgency(lower)) {
    return NextResponse.json({ error: 'Unknown agency' }, { status: 404 });
  }
  if (!canAccessAgency(session.user.role, session.user.agency, lower)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('agency_scheduled_reports')
    .select('*')
    .eq('agency', lower.toUpperCase())
    .order('created_at', { ascending: false });
  if (error) {
    logger.error({ err: error, agency: lower }, 'schedules: list failed');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ schedules: data ?? [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agency: string }> },
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { agency } = await params;
  const lower = agency.toLowerCase();
  if (!isIntelAgency(lower)) {
    return NextResponse.json({ error: 'Unknown agency' }, { status: 404 });
  }
  if (!canAccessAgency(session.user.role, session.user.agency, lower)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const v = parsed.data;
  const candidates = v.recipients.map((s) => s.trim()).filter((s) => s.length > 0);
  const { valid, invalid } = validateEmailList(candidates);
  if (valid.length === 0) {
    return NextResponse.json(
      { error: 'No valid recipients', invalid },
      { status: 400 },
    );
  }

  if ((v.frequency === 'weekly' || v.frequency === 'fortnightly') && v.day_of_week == null) {
    return NextResponse.json({ error: 'day_of_week required for weekly or fortnightly' }, { status: 400 });
  }
  if (v.frequency === 'monthly' && v.day_of_month == null) {
    return NextResponse.json({ error: 'day_of_month required for monthly' }, { status: 400 });
  }

  const sendHour = v.send_hour ?? 8;
  const timezone = 'America/Guyana';
  // Mutual exclusivity: only the day field matching the chosen frequency
  // stores a value. The other stays null so the CHECK constraint and
  // future readers see a coherent row.
  const isWeekish = v.frequency === 'weekly' || v.frequency === 'fortnightly';
  const dow = isWeekish ? (v.day_of_week ?? null) : null;
  const dom = v.frequency === 'monthly' ? (v.day_of_month ?? null) : null;

  const nextRunAt = computeNextRunAt({
    frequency: v.frequency as Frequency,
    day_of_week: dow,
    day_of_month: dom,
    send_hour: sendHour,
    timezone,
  });

  const { data, error } = await supabaseAdmin
    .from('agency_scheduled_reports')
    .insert({
      created_by_user_id: session.user.id,
      agency: lower.toUpperCase(),
      recipients: valid,
      cover_message: v.cover_message ?? null,
      frequency: v.frequency,
      day_of_week: dow,
      day_of_month: dom,
      send_hour: sendHour,
      timezone,
      template: v.template ?? 'plain',
      next_run_at: nextRunAt.toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    logger.error({ err: error, agency: lower }, 'schedules: insert failed');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ schedule: data, invalid_skipped: invalid });
}
