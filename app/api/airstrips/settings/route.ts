import { NextRequest, NextResponse } from 'next/server';
import { requireAirstripAccess, requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseBody } from '@/lib/api-utils';

const COLS = 'default_interval_days, upcoming_window_days, verification_stale_after_days, updated_at';

// GET /api/airstrips/settings — cadence + warning thresholds (singleton).
export async function GET() {
  const authResult = await requireAirstripAccess();
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await supabaseAdmin
    .from('airstrip_settings').select(COLS).eq('id', 1).single();
  if (error) {
    logger.error({ err: error }, 'Airstrip settings fetch failed');
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
  return NextResponse.json({ settings: data });
}

const patchSchema = z.object({
  default_interval_days: z.number().int().positive().optional(),
  upcoming_window_days: z.number().int().min(0).optional(),
  verification_stale_after_days: z.number().int().positive().optional(),
});

// PATCH /api/airstrips/settings — update thresholds. Superadmin only: cadence
// thresholds are a ministry-wide policy, so an agency_manager (incl. HAS) may view
// them (GET) but not change them.
export async function PATCH(request: NextRequest) {
  const authResult = await requireRole(['superadmin']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const { data, error: validationError } = await parseBody(request, patchSchema);
  if (validationError) return validationError;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from('airstrip_settings')
    .update({ ...data, updated_by: session.user.id, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select(COLS)
    .single();
  if (error) {
    logger.error({ err: error }, 'Airstrip settings update failed');
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
  return NextResponse.json({ settings: updated });
}
