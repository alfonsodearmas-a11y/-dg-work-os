import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

const METRIC_COLUMNS = 'id, snapshot_id, track, stage, category, total_count, valid_count, error_count, sla_target_days, within_sla_count, sla_compliance_pct, mean_days, median_days, trimmed_mean_days, mode_days, std_dev, min_days, max_days, q1, q3, p90, p95, ageing_buckets, staff_breakdown';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    // Get latest snapshot
    const { data: snapshot } = await supabaseAdmin
      .from('gpl_snapshots')
      .select('id, snapshot_date, track_b_design_outstanding, track_b_execution_outstanding, track_b_design_completed, track_b_execution_completed')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    if (!snapshot) {
      return NextResponse.json({ pipeline: null, previousPipeline: null });
    }

    // Get Track B metrics for this snapshot
    const { data: metrics } = await supabaseAdmin
      .from('gpl_snapshot_metrics')
      .select(METRIC_COLUMNS)
      .eq('snapshot_id', snapshot.id)
      .eq('track', 'B');

    const metricsByKey = new Map<string, Record<string, unknown>>();
    for (const m of metrics ?? []) {
      metricsByKey.set(`${m.stage}:${m.category}`, m);
    }

    // Get previous snapshot for delta comparison
    const { data: prevSnapshots } = await supabaseAdmin
      .from('gpl_snapshots')
      .select('id, snapshot_date, track_b_design_outstanding, track_b_execution_outstanding, track_b_design_completed, track_b_execution_completed')
      .lt('snapshot_date', snapshot.snapshot_date)
      .order('snapshot_date', { ascending: false })
      .limit(1);

    let previousPipeline = null;
    const prevSnapshot = prevSnapshots?.[0];
    if (prevSnapshot) {
      const { data: prevMetrics } = await supabaseAdmin
        .from('gpl_snapshot_metrics')
        .select(METRIC_COLUMNS)
        .eq('snapshot_id', prevSnapshot.id)
        .eq('track', 'B');

      const prevMetricsByKey = new Map<string, Record<string, unknown>>();
      for (const m of prevMetrics ?? []) {
        prevMetricsByKey.set(`${m.stage}:${m.category}`, m);
      }

      previousPipeline = {
        snapshotDate: prevSnapshot.snapshot_date,
        design: {
          outstanding: prevSnapshot.track_b_design_outstanding,
          completed: prevSnapshot.track_b_design_completed,
          metrics: {
            outstanding: prevMetricsByKey.get('design:outstanding') ?? null,
            completed: prevMetricsByKey.get('design:completed') ?? null,
          },
        },
        execution: {
          outstanding: prevSnapshot.track_b_execution_outstanding,
          completed: prevSnapshot.track_b_execution_completed,
          metrics: {
            outstanding: prevMetricsByKey.get('execution:outstanding') ?? null,
            completed: prevMetricsByKey.get('execution:completed') ?? null,
          },
        },
      };
    }

    return NextResponse.json({
      pipeline: {
        snapshotDate: snapshot.snapshot_date,
        design: {
          outstanding: snapshot.track_b_design_outstanding,
          completed: snapshot.track_b_design_completed,
          metrics: {
            outstanding: metricsByKey.get('design:outstanding') ?? null,
            completed: metricsByKey.get('design:completed') ?? null,
          },
        },
        execution: {
          outstanding: snapshot.track_b_execution_outstanding,
          completed: snapshot.track_b_execution_completed,
          metrics: {
            outstanding: metricsByKey.get('execution:outstanding') ?? null,
            completed: metricsByKey.get('execution:completed') ?? null,
          },
        },
      },
      previousPipeline,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch SC pipeline data');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
