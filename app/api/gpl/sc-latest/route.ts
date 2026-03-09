import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    // Get latest snapshot
    const { data: snapshot, error: snapError } = await supabaseAdmin
      .from('gpl_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    if (snapError || !snapshot) {
      return NextResponse.json({ snapshot: null, metrics: [], previousSnapshot: null });
    }

    // Get metrics for this snapshot
    const { data: metrics } = await supabaseAdmin
      .from('gpl_snapshot_metrics')
      .select('*')
      .eq('snapshot_id', snapshot.id);

    // Get previous snapshot for delta comparison
    const { data: prevSnapshots } = await supabaseAdmin
      .from('gpl_snapshots')
      .select('*')
      .lt('snapshot_date', snapshot.snapshot_date)
      .order('snapshot_date', { ascending: false })
      .limit(1);

    let previousMetrics: Record<string, unknown>[] | null = null;
    const previousSnapshot = prevSnapshots?.[0] ?? null;
    if (previousSnapshot) {
      const { data: pm } = await supabaseAdmin
        .from('gpl_snapshot_metrics')
        .select('*')
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
