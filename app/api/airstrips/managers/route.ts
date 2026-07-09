import { NextResponse } from 'next/server';
import { requireAirstripAccess } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';

// GET /api/airstrips/managers — users eligible to be a responsible manager for an
// airstrip: superadmins and the Hinterland Airstrips (HAS) agency_manager(s).
export async function GET() {
  const authResult = await requireAirstripAccess();
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, email, role, agency')
    .eq('is_active', true)
    .or('role.eq.superadmin,and(role.eq.agency_manager,agency.eq.HAS)')
    .order('name');
  if (error) {
    logger.error({ err: error }, 'Airstrip managers list error');
    return NextResponse.json({ error: 'Failed to fetch managers' }, { status: 500 });
  }
  return NextResponse.json({ managers: data ?? [] });
}
