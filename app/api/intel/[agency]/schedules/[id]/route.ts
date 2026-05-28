import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { isIntelAgency } from '@/lib/agencies';
import { logger } from '@/lib/logger';
import { validateEmailList } from '@/lib/email-validation';
import { computeNextRunAt, type Frequency } from '@/lib/intel/schedule-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    active: z.boolean().optional(),
    recipients: z.array(z.string().min(1)).min(1).optional(),
    cover_message: z.string().max(2000).nullable().optional(),
    frequency: z.enum(['weekly', 'fortnightly', 'monthly']).optional(),
    day_of_week: z.number().int().min(0).max(6).nullable().optional(),
    day_of_month: z.number().int().min(1).max(28).nullable().optional(),
    send_hour: z.number().int().min(0).max(23).optional(),
    template: z.enum(['plain', 'editorial']).optional(),
  })
  .strict();

const RECOMPUTE_KEYS = new Set([
  'frequency',
  'day_of_week',
  'day_of_month',
  'send_hour',
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ agency: string; id: string }> },
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { agency, id } = await params;
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {};
  if (typeof parsed.data.active === 'boolean') update.active = parsed.data.active;
  if (parsed.data.recipients) {
    const { valid, invalid } = validateEmailList(parsed.data.recipients);
    if (valid.length === 0) {
      return NextResponse.json({ error: 'No valid recipients', invalid }, { status: 400 });
    }
    update.recipients = valid;
  }
  if ('cover_message' in parsed.data) {
    update.cover_message = parsed.data.cover_message ?? null;
  }
  if (parsed.data.frequency) update.frequency = parsed.data.frequency;
  if ('day_of_week' in parsed.data) update.day_of_week = parsed.data.day_of_week ?? null;
  if ('day_of_month' in parsed.data) update.day_of_month = parsed.data.day_of_month ?? null;
  if (typeof parsed.data.send_hour === 'number') update.send_hour = parsed.data.send_hour;
  if (parsed.data.template) update.template = parsed.data.template;

  // Recompute next_run_at when any timing field changed.
  const recompute = Object.keys(update).some((k) => RECOMPUTE_KEYS.has(k));
  if (recompute) {
    const { data: current, error: currentErr } = await supabaseAdmin
      .from('agency_scheduled_reports')
      .select('frequency, day_of_week, day_of_month, send_hour, timezone, agency')
      .eq('id', id)
      .single();
    if (currentErr || !current) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }
    if (String(current.agency).toUpperCase() !== lower.toUpperCase()) {
      return NextResponse.json({ error: 'Schedule does not belong to this agency' }, { status: 404 });
    }

    const effectiveFrequency: Frequency =
      (update.frequency as Frequency) ?? (current.frequency as Frequency);
    const effectiveDow =
      'day_of_week' in update
        ? (update.day_of_week as number | null)
        : (current.day_of_week as number | null);
    const effectiveDom =
      'day_of_month' in update
        ? (update.day_of_month as number | null)
        : (current.day_of_month as number | null);

    // Enforce frequency / day-field consistency before calling
    // computeNextRunAt so a missing field returns a 400 instead of bubbling
    // a 500 from the math function. Also null out the unused day field so
    // the row stays clean.
    if ((effectiveFrequency === 'weekly' || effectiveFrequency === 'fortnightly') && effectiveDow == null) {
      return NextResponse.json(
        { error: 'day_of_week required for weekly or fortnightly' },
        { status: 400 },
      );
    }
    if (effectiveFrequency === 'monthly' && effectiveDom == null) {
      return NextResponse.json(
        { error: 'day_of_month required for monthly' },
        { status: 400 },
      );
    }
    if (effectiveFrequency === 'weekly' || effectiveFrequency === 'fortnightly') {
      update.day_of_month = null;
    } else {
      update.day_of_week = null;
    }

    const next = computeNextRunAt({
      frequency: effectiveFrequency,
      day_of_week: effectiveDow,
      day_of_month: effectiveDom,
      send_hour: (update.send_hour as number | undefined) ?? (current.send_hour as number),
      timezone: current.timezone as string,
    });
    update.next_run_at = next.toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('agency_scheduled_reports')
    .update(update)
    .eq('id', id)
    .eq('agency', lower.toUpperCase())
    .select('*')
    .single();

  if (error) {
    logger.error({ err: error, id }, 'schedules: update failed');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ schedule: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ agency: string; id: string }> },
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { agency, id } = await params;
  const lower = agency.toLowerCase();
  if (!isIntelAgency(lower)) {
    return NextResponse.json({ error: 'Unknown agency' }, { status: 404 });
  }
  if (!canAccessAgency(session.user.role, session.user.agency, lower)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from('agency_scheduled_reports')
    .delete()
    .eq('id', id)
    .eq('agency', lower.toUpperCase());

  if (error) {
    logger.error({ err: error, id }, 'schedules: delete failed');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
