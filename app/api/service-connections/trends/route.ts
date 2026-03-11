import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { computeMonthlyVolumes } from '@/lib/service-connection-analysis';
import type { ServiceConnection } from '@/lib/service-connection-types';
import { logger } from '@/lib/logger';

const SC_COLUMNS = 'id, customer_reference, service_order_number, first_name, last_name, telephone, region, district, village_ward, street, lot, account_type, service_order_type, division_code, cycle, application_date, track, job_complexity, status, current_stage, stage_history, first_seen_date, last_seen_date, disappeared_date, energisation_date, total_days_to_complete, is_legacy, linked_so_number, created_at, updated_at';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;
    const { searchParams } = new URL(request.url);
    const months = parseInt(searchParams.get('months') || '12', 10);
    const track = searchParams.get('track') || 'all';

    let query = supabaseAdmin
      .from('service_connections')
      .select(SC_COLUMNS)
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
    logger.error({ err }, 'Service connection trends fetch failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
