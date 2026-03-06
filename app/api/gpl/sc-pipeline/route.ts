import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  try {
    // Get latest snapshot
    const { data: snapshot } = await supabaseAdmin
      .from('gpl_snapshots')
      .select('id, snapshot_date, track_b_design_outstanding, track_b_execution_outstanding, track_b_design_completed, track_b_execution_completed')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    if (!snapshot) {
      return NextResponse.json({ pipeline: null });
    }

    // Get Track B metrics for this snapshot
    const { data: metrics } = await supabaseAdmin
      .from('gpl_snapshot_metrics')
      .select('*')
      .eq('snapshot_id', snapshot.id)
      .eq('track', 'B');

    const metricsByKey = new Map<string, Record<string, unknown>>();
    for (const m of metrics ?? []) {
      metricsByKey.set(`${m.stage}:${m.category}`, m);
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
    });
  } catch (err) {
    console.error('[gpl/sc-pipeline] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
