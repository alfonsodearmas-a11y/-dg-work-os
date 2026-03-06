import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { searchParams } = new URL(request.url);
  const agency = searchParams.get('agency');

  let query = supabaseAdmin
    .from('users')
    .select('id, name, role, agency')
    .eq('is_active', true)
    .order('name');

  if (agency) {
    // Show users from that agency + ministry-level users
    query = query.or(`agency.eq.${agency},role.in.(dg,minister,ps)`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data || [] });
}
