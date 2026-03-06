import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
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
    console.error('[gpl/sc-latest] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
