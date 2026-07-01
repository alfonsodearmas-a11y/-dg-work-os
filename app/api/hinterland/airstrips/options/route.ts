import { NextResponse } from 'next/server';
import { requireHinterlandAccess } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { AirstripOption } from '@/lib/hinterland-types';

// ── GET /api/hinterland/airstrips/options ─────────────────────────────────────
// Airstrip id/name/region/status for the "nearest airstrip" dropdown. Sourced
// from the airstrips module (system of record). The community→airstrip link is
// MANUAL and human-reviewed — never fuzzy-matched by name.

export async function GET() {
  try {
    const authResult = await requireHinterlandAccess();
    if (authResult instanceof NextResponse) return authResult;

    const { data, error } = await supabaseAdmin
      .from('airstrips')
      .select('id, name, region, status')
      .order('name', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ airstrips: (data ?? []) as AirstripOption[] });
  } catch (error) {
    logger.error({ err: error }, 'Hinterland airstrip options error');
    return NextResponse.json({ error: 'Failed to fetch airstrip options' }, { status: 500 });
  }
}
