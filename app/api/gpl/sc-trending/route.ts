import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

const METRIC_COLUMNS = 'id, snapshot_id, track, stage, category, total_count, valid_count, error_count, sla_target_days, within_sla_count, sla_compliance_pct, mean_days, median_days, trimmed_mean_days, mode_days, std_dev, min_days, max_days, q1, q3, p90, p95, ageing_buckets, staff_breakdown';

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
      logger.error({ error: snapError }, 'GPL SC trending: snapshot query failed');
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
