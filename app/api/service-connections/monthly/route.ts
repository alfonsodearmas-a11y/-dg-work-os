import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

const MONTHLY_STATS_COLUMNS = 'id, report_month, opened_count, completed_count, queue_depth, avg_days_to_complete, pct_within_sla, track_a_completed, track_a_avg_days, track_a_sla_pct, track_b_completed, track_b_avg_days, track_b_sla_pct, design_completed, design_avg_days, design_sla_pct, created_at';

export async function GET() {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const { data, error } = await supabaseAdmin
      .from('service_connection_monthly_stats')
      .select(MONTHLY_STATS_COLUMNS)
      .order('report_month', { ascending: false })
      .limit(24);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch monthly stats' }, { status: 500 });
    }

    return NextResponse.json({ stats: data || [] });
  } catch (err) {
    logger.error({ err }, 'Service connection monthly stats fetch failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
