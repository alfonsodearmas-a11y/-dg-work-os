import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

const SNAPSHOT_COLUMNS = 'id, snapshot_date, track_a_outstanding, track_a_completed, track_b_design_outstanding, track_b_execution_outstanding, track_b_design_completed, track_b_execution_completed, track_b_total_outstanding, warning_count, uploaded_at';
const METRIC_COLUMNS = 'id, snapshot_id, track, stage, category, total_count, valid_count, error_count, sla_target_days, within_sla_count, sla_compliance_pct, mean_days, median_days, trimmed_mean_days, mode_days, std_dev, min_days, max_days, q1, q3, p90, p95, ageing_buckets, staff_breakdown';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    // Get latest snapshot
    const { data: snapshot, error: snapError } = await supabaseAdmin
      .from('gpl_snapshots')
      .select(SNAPSHOT_COLUMNS)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    if (snapError || !snapshot) {
      if (snapError) logger.error({ error: snapError }, 'GPL SC latest: snapshot query failed');
      return NextResponse.json({ snapshot: null, metrics: [], previousSnapshot: null });
    }

    // Get metrics for this snapshot
    const { data: metrics } = await supabaseAdmin
      .from('gpl_snapshot_metrics')
      .select(METRIC_COLUMNS)
      .eq('snapshot_id', snapshot.id);

    // Get previous snapshot for delta comparison
    const { data: prevSnapshots } = await supabaseAdmin
      .from('gpl_snapshots')
      .select(SNAPSHOT_COLUMNS)
      .lt('snapshot_date', snapshot.snapshot_date)
      .order('snapshot_date', { ascending: false })
      .limit(1);

    let previousMetrics: Record<string, unknown>[] | null = null;
    const previousSnapshot = prevSnapshots?.[0] ?? null;
    if (previousSnapshot) {
      const { data: pm } = await supabaseAdmin
        .from('gpl_snapshot_metrics')
        .select(METRIC_COLUMNS)
        .eq('snapshot_id', previousSnapshot.id);
      previousMetrics = pm;
    }

    return NextResponse.json({
      snapshot,
      metrics: metrics ?? [],
      previousSnapshot,
      previousMetrics: previousMetrics ?? [],
    });
  } catch (err) {
    logger.error({ err }, 'GPL SC latest snapshot fetch failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
