import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { calculateFeederHealth } from '@/lib/gpl/scoring';
import { mapOutageRow, mapFeederRow } from '@/lib/gpl/sync';
import type { GplOutage } from '@/lib/gpl/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  if (!canAccessAgency(session.user.role, session.user.agency, 'gpl')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { id } = await params;
  const feederId = parseInt(id, 10);
  if (isNaN(feederId)) {
    return NextResponse.json({ error: 'Invalid feeder ID' }, { status: 400 });
  }

  try {
    const { data: feederRow, error: feederError } = await supabaseAdmin
      .from('gpl_feeder_cache')
      .select('*')
      .eq('feeder_id', feederId)
      .single();

    if (feederError || !feederRow) {
      return NextResponse.json({ error: 'Feeder not found' }, { status: 404 });
    }

    const feeder = mapFeederRow(feederRow);

    const { data: outageRows, error: outageError } = await supabaseAdmin
      .from('gpl_outage_cache')
      .select('*')
      .or(`feeder_id.eq.${feederId},feeder_code.eq.${feederRow.code}`)
      .order('date', { ascending: false });

    if (outageError) throw outageError;

    const allOutages: GplOutage[] = (outageRows ?? []).map(mapOutageRow);

    // calculateFeederHealth filters to this feeder internally — no need to fetch all system outages
    const health = calculateFeederHealth(feeder, allOutages);

    // 90-day window for outage history
    const cutoff90d = new Date();
    cutoff90d.setDate(cutoff90d.getDate() - 90);
    const cutoff90dStr = cutoff90d.toISOString().slice(0, 10);
    const outageHistory = allOutages
      .filter((o) => o.date >= cutoff90dStr)
      .map((o) => ({
        id: o.id,
        date: o.date,
        time_out: o.time_out,
        time_in: o.time_in,
        duration_minutes: o.duration_minutes,
        cause_subcategory: o.cause_subcategory,
        cause_detail: o.cause_detail,
        status: o.status,
      }));

    // 30-day stats
    const cutoff30d = new Date();
    cutoff30d.setDate(cutoff30d.getDate() - 30);
    const cutoff30dStr = cutoff30d.toISOString().slice(0, 10);
    const recent30d = allOutages.filter((o) => o.date >= cutoff30dStr);

    const durations = recent30d
      .map((o) => o.duration_minutes)
      .filter((d): d is number => d != null && d > 0);
    const mttrMin = durations.length > 0
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
      : 0;

    const mtbfDays = recent30d.length > 1
      ? Math.round((30 / recent30d.length) * 10) / 10
      : recent30d.length === 1
        ? 30
        : null;

    const customerMinutes30d = recent30d.reduce(
      (sum, o) => sum + (o.duration_minutes ?? 0) * (o.customers_affected ?? 0),
      0
    );

    const longestOutage = allOutages.reduce<{ duration_minutes: number; date: string } | null>(
      (best, o) => {
        const dur = o.duration_minutes ?? 0;
        if (!best || dur > best.duration_minutes) {
          return { duration_minutes: dur, date: o.date };
        }
        return best;
      },
      null
    );

    // Cause breakdown
    const causeMap = new Map<string, number>();
    for (const o of allOutages) {
      const cause = o.cause_subcategory ?? 'Unknown';
      causeMap.set(cause, (causeMap.get(cause) ?? 0) + 1);
    }
    const causeBreakdown = Array.from(causeMap.entries())
      .map(([subcategory, count]) => ({
        subcategory,
        count,
        pct: allOutages.length > 0 ? Math.round((count / allOutages.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Monthly trend
    const monthMap = new Map<string, number>();
    for (const o of allOutages) {
      if (!o.date) continue;
      const month = o.date.slice(0, 7);
      monthMap.set(month, (monthMap.get(month) ?? 0) + 1);
    }
    const monthlyTrend = Array.from(monthMap.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Construct substation display name from code
    const substationName = feeder.substation_code
      ? `${feeder.substation_code.charAt(0)}${feeder.substation_code.slice(1).toLowerCase()} Substation`
      : 'Unknown Substation';

    return NextResponse.json({
      feeder: {
        id: feeder.id,
        code: feeder.code,
        name: feeder.name,
        substation_code: feeder.substation_code,
        substation_name: substationName,
        area_served: feeder.area_served,
        customer_count: feeder.customer_count,
      },
      health: {
        grade: health.grade,
        score: health.score,
        outages_30d: health.outages_30d,
        avg_duration_min: health.avg_duration_min,
        total_downtime_min: Math.round(
          recent30d.reduce((sum, o) => sum + (o.duration_minutes ?? 0), 0)
        ),
        trend: health.trend,
      },
      stats: {
        mtbf_days: mtbfDays,
        mttr_min: mttrMin,
        customer_minutes_30d: customerMinutes30d,
        longest_outage: longestOutage,
        total_outages_all_time: allOutages.length,
      },
      outage_history: outageHistory,
      cause_breakdown: causeBreakdown,
      monthly_trend: monthlyTrend,
    });
  } catch (error: unknown) {
    logger.error({ err: error, feederId }, 'Failed to fetch feeder detail');
    return NextResponse.json(
      { error: 'Failed to fetch feeder detail' },
      { status: 500 }
    );
  }
}
