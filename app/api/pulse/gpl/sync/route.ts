import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { syncGplData, mapOutageRow, mapFeederRow } from '@/lib/gpl/sync';
import { calculatePulseScore } from '@/lib/gpl/scoring';

export async function POST(_request: NextRequest) {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  if (!canAccessAgency(session.user.role, session.user.agency, 'gpl')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    // 1. Sync from GPL Dashboard API → cache tables
    const syncResult = await syncGplData();

    if (!syncResult.synced) {
      return NextResponse.json({
        success: false,
        error: syncResult.error,
      }, { status: 502 });
    }

    // 2. Read cached data to calculate pulse score
    const [outagesResult, feedersResult] = await Promise.all([
      supabaseAdmin
        .from('gpl_outage_cache')
        .select('*')
        .order('date', { ascending: false }),
      supabaseAdmin
        .from('gpl_feeder_cache')
        .select('*'),
    ]);

    if (outagesResult.error) throw outagesResult.error;
    if (feedersResult.error) throw feedersResult.error;

    const outages = (outagesResult.data ?? []).map(mapOutageRow);
    const feeders = (feedersResult.data ?? []).map(mapFeederRow);

    // 3. Calculate and store pulse score
    const pulseScore = calculatePulseScore(outages, feeders);

    const { error: scoreError } = await supabaseAdmin
      .from('gpl_pulse_scores')
      .insert({
        overall: pulseScore.overall,
        frequency_score: pulseScore.frequency_score,
        restoration_score: pulseScore.restoration_score,
        impact_score: pulseScore.impact_score,
        outage_count_30d: pulseScore.outage_count_30d,
        avg_restoration_min: pulseScore.avg_restoration_min,
        cmi_per_1000: pulseScore.cmi_per_1000,
        score_breakdown: pulseScore,
      });

    if (scoreError) {
      logger.error({ err: scoreError }, 'Failed to store pulse score');
      // Non-fatal — sync succeeded, score storage is secondary
    }

    return NextResponse.json({
      success: true,
      data: {
        synced: true,
        outages_synced: syncResult.outages_synced,
        feeders_synced: syncResult.feeders_synced,
        new_records: syncResult.new_outage_records,
        pulse_score: pulseScore,
      },
    });
  } catch (error: unknown) {
    logger.error({ err: error }, 'GPL grid health sync failed');
    return NextResponse.json(
      { success: false, error: 'Failed to sync GPL grid health data' },
      { status: 500 }
    );
  }
}
