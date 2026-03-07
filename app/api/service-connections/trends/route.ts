import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { computeMonthlyVolumes } from '@/lib/service-connection-analysis';
import type { ServiceConnection } from '@/lib/service-connection-types';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;
    const { searchParams } = new URL(request.url);
    const months = parseInt(searchParams.get('months') || '12', 10);
    const track = searchParams.get('track') || 'all';

    let query = supabaseAdmin
      .from('service_connections')
      .select('*')
      .neq('status', 'legacy_excluded')
      .not('is_legacy', 'eq', true);

    if (track !== 'all') {
      query = query.eq('track', track);
    }

    const { data, error } = await query.order('application_date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch service connection trends' }, { status: 500 });
    }

    const volumes = computeMonthlyVolumes((data || []) as ServiceConnection[]);
    const recentMonths = volumes.slice(-months);

    return NextResponse.json({ months: recentMonths, track });
  } catch (err) {
    console.error('[service-connections/trends] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
