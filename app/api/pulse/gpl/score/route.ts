import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { calculatePulseScore } from '@/lib/gpl/scoring';
import { isCacheStale, syncGplData, mapOutageRow, mapFeederRow } from '@/lib/gpl/sync';

/** Calculate 7-day rolling overall scores for the trend sparkline */
function calculate7DayTrend(outages: ReturnType<typeof mapOutageRow>[], feeders: ReturnType<typeof mapFeederRow>[]): number[] {
  const today = new Date();
  const trend: number[] = [];

  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const refDate = new Date(today);
    refDate.setDate(refDate.getDate() - daysAgo);
    const cutoff = new Date(refDate);
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const refStr = refDate.toISOString().slice(0, 10);
    const windowOutages = outages.filter((o) => o.date >= cutoffStr && o.date <= refStr);
    trend.push(calculatePulseScore(windowOutages, feeders, 30).overall);
  }

  return trend;
}

export async function GET() {
  try {
    let stale = false;
    if (await isCacheStale()) {
      const syncResult = await syncGplData();
      if (!syncResult.synced) {
        stale = true;
        logger.warn('GPL score: sync failed, using stale cache');
      }
    }

    // Only fetch last 60 days of outages (30d scoring + 30d for trend window)
    const cutoff60d = new Date();
    cutoff60d.setDate(cutoff60d.getDate() - 60);

    const [outagesResult, feedersResult] = await Promise.all([
      supabaseAdmin
        .from('gpl_outage_cache')
        .select('*')
        .gte('date', cutoff60d.toISOString().slice(0, 10))
        .order('date', { ascending: false }),
      supabaseAdmin
        .from('gpl_feeder_cache')
        .select('*'),
    ]);

    if (outagesResult.error) throw outagesResult.error;
    if (feedersResult.error) throw feedersResult.error;

    const outages = (outagesResult.data ?? []).map(mapOutageRow);
    const feeders = (feedersResult.data ?? []).map(mapFeederRow);

    if (outages.length === 0) {
      return NextResponse.json(
        { error: 'No outage data in cache. Run sync first.' },
        { status: 404 }
      );
    }

    const pulse = calculatePulseScore(outages, feeders);

    // Total ENS for 30d window
    const cutoff30d = new Date();
    cutoff30d.setDate(cutoff30d.getDate() - 30);
    const cutoffStr = cutoff30d.toISOString().slice(0, 10);
    const totalEns = outages
      .filter((o) => o.date >= cutoffStr)
      .reduce((sum, o) => sum + (o.ens_mwh ?? 0), 0);

    const lastSynced = outagesResult.data?.[0]?.synced_at ?? new Date().toISOString();

    return NextResponse.json({
      ...pulse,
      total_ens_mwh: Math.round(totalEns * 10) / 10,
      last_synced: lastSynced,
      trend_7d: calculate7DayTrend(outages, feeders),
      ...(stale && { stale: true }),
    });
  } catch (error: unknown) {
    logger.error({ err: error }, 'Failed to compute GPL pulse score');
    return NextResponse.json(
      { error: 'Failed to compute GPL pulse score' },
      { status: 500 }
    );
  }
}
