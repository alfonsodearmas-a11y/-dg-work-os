import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const snapshotId = searchParams.get('snapshot_id');

    // Get all metrics with staff_breakdown
    let query = supabaseAdmin
      .from('gpl_snapshot_metrics')
      .select('track, stage, category, staff_breakdown, snapshot_id')
      .eq('category', 'completed')
      .not('staff_breakdown', 'is', null);

    if (snapshotId) {
      query = query.eq('snapshot_id', snapshotId);
    } else {
      // Latest snapshot
      const { data: latest } = await supabaseAdmin
        .from('gpl_snapshots')
        .select('id')
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();
      if (latest) query = query.eq('snapshot_id', latest.id);
    }

    const { data: metricsRows, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch staff data' }, { status: 500 });
    }

    // Aggregate staff data across stages
    interface StaffAgg {
      name: string;
      trackA: { count: number; totalDays: number; days: number[] };
      design: { count: number; totalDays: number; days: number[] };
      execution: { count: number; totalDays: number; days: number[] };
    }

    const staffMap = new Map<string, StaffAgg>();

    for (const row of metricsRows ?? []) {
      const breakdown = row.staff_breakdown as { name: string; count: number; mean: number; median: number }[] | null;
      if (!breakdown) continue;

      for (const s of breakdown) {
        if (!staffMap.has(s.name)) {
          staffMap.set(s.name, {
            name: s.name,
            trackA: { count: 0, totalDays: 0, days: [] },
            design: { count: 0, totalDays: 0, days: [] },
            execution: { count: 0, totalDays: 0, days: [] },
          });
        }
        const agg = staffMap.get(s.name)!;
        const bucket = row.track === 'A' ? agg.trackA
          : row.stage === 'design' ? agg.design
          : agg.execution;
        bucket.count += s.count;
        bucket.totalDays += s.mean * s.count;
      }
    }

    const staff = Array.from(staffMap.values())
      .map(s => ({
        name: s.name,
        trackA_count: s.trackA.count,
        trackA_avg: s.trackA.count > 0 ? Math.round((s.trackA.totalDays / s.trackA.count) * 100) / 100 : null,
        design_count: s.design.count,
        design_avg: s.design.count > 0 ? Math.round((s.design.totalDays / s.design.count) * 100) / 100 : null,
        execution_count: s.execution.count,
        execution_avg: s.execution.count > 0 ? Math.round((s.execution.totalDays / s.execution.count) * 100) / 100 : null,
        total_count: s.trackA.count + s.design.count + s.execution.count,
      }))
      .sort((a, b) => b.total_count - a.total_count);

    return NextResponse.json({ staff });
  } catch (err) {
    logger.error({ err }, 'GPL SC staff data fetch failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
