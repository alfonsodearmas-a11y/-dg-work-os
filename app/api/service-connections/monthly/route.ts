import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';

export async function GET() {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const { data, error } = await supabaseAdmin
      .from('service_connection_monthly_stats')
      .select('*')
      .order('report_month', { ascending: false })
      .limit(24);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch monthly stats' }, { status: 500 });
    }

    return NextResponse.json({ stats: data || [] });
  } catch (err) {
    console.error('[service-connections/monthly] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
