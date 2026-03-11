import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

const METRIC_COLUMNS = 'id, snapshot_id, track, stage, category, count, avg_days, median_days, sla_target_days, within_sla_count, within_sla_pct, oldest_days, oldest_ref';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const stages = searchParams.get('stages')?.split(',') ?? [];

    // Get snapshots ordered by date
    const { data: snapshots, error: snapError } = await supabaseAdmin
      .from('gpl_snapshots')
      .select('id, snapshot_date, track_a_outstanding, track_a_completed, track_b_design_outstanding, track_b_execution_outstanding, track_b_design_completed, track_b_execution_completed, track_b_total_outstanding, warning_count')
      .order('snapshot_date', { ascending: true })
      .limit(limit);

    if (snapError) {
      return NextResponse.json({ error: 'Failed to fetch trending data' }, { status: 500 });
    }

    if (!snapshots || snapshots.length === 0) {
      return NextResponse.json({ snapshots: [], metrics: [] });
    }

    const snapshotIds = snapshots.map(s => s.id);

    // Get all metrics for these snapshots
    let metricsQuery = supabaseAdmin
      .from('gpl_snapshot_metrics')
      .select(METRIC_COLUMNS)
      .in('snapshot_id', snapshotIds);

    if (stages.length > 0) {
      metricsQuery = metricsQuery.in('stage', stages);
    }

    const { data: metrics } = await metricsQuery;

    return NextResponse.json({
      snapshots: snapshots ?? [],
      metrics: metrics ?? [],
    });
  } catch (err) {
    logger.error({ err }, 'GPL SC trending data fetch failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
