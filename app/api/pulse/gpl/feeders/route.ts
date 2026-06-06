import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { calculateFeederHealth } from '@/lib/gpl/scoring';
import type { GplOutage, GplFeeder, FeederGrade, TrendDirection } from '@/lib/gpl/types';

interface FeederResponse {
  feeder_id: number;
  feeder_code: string;
  feeder_name: string;
  substation_code: string;
  substation_name: string;
  area_served: string | null;
  customer_count: number;
  health: {
    grade: FeederGrade;
    score: number;
    outages_30d: number;
    avg_duration_min: number;
    total_downtime_min: number;
    top_cause: string | null;
    trend: TrendDirection;
    last_outage_date: string | null;
    last_outage_time: string | null;
  };
}

const VALID_SORTS = new Set(['grade_asc', 'grade_desc', 'outages', 'customers']);
const GRADE_ORDER: FeederGrade[] = ['F', 'D', 'C', 'B', 'A'];

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  if (!canAccessAgency(session.user.role, session.user.agency, 'gpl')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const substationFilter = searchParams.get('substation');
  const gradeFilter = searchParams.get('grade')?.split(',') as FeederGrade[] | undefined;
  const sortRaw = searchParams.get('sort') ?? 'grade_asc';
  const sortParam = VALID_SORTS.has(sortRaw) ? sortRaw : 'grade_asc';

  const [outagesResult, feedersResult] = await Promise.all([
    supabaseAdmin
      .from('gpl_outage_cache')
      .select('*')
      .order('date', { ascending: false }),
    supabaseAdmin
      .from('gpl_feeder_cache')
      .select('*'),
  ]);

  if (outagesResult.error) {
    return NextResponse.json({ error: 'Failed to read outage data' }, { status: 500 });
  }
  if (feedersResult.error) {
    return NextResponse.json({ error: 'Failed to read feeder data' }, { status: 500 });
  }

  const outages: GplOutage[] = (outagesResult.data ?? []).map((r) => ({
    id: r.outage_id,
    feeder_id: r.feeder_id,
    date: r.date,
    time_out: r.time_out,
    time_in: r.time_in,
    duration_minutes: r.duration_minutes,
    customers_affected: r.customers_affected,
    mw_lost: r.mw_lost,
    ens_mwh: r.ens_mwh,
    cause_detail: r.cause_detail,
    status: r.status,
    areas_affected: r.areas_affected,
    feeder_code: r.feeder_code,
    substation_code: r.substation_code,
    cause_category: r.cause_category,
    cause_subcategory: r.cause_subcategory,
    root_cause: r.root_cause,
  }));

  const feeders: GplFeeder[] = (feedersResult.data ?? []).map((r) => ({
    id: r.feeder_id,
    code: r.code,
    name: r.name,
    substation_code: r.substation_code,
    area_served: r.area_served,
    customer_count: r.customer_count,
  }));

  // Pre-group outages by feeder to avoid repeated O(N) scans
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const outagesByFeederId = new Map<number, GplOutage[]>();
  const outagesByFeederCode = new Map<string, GplOutage[]>();
  for (const o of outages) {
    if (o.feeder_id != null) {
      const arr = outagesByFeederId.get(o.feeder_id) ?? [];
      arr.push(o);
      outagesByFeederId.set(o.feeder_id, arr);
    }
    if (o.feeder_code) {
      const arr = outagesByFeederCode.get(o.feeder_code) ?? [];
      arr.push(o);
      outagesByFeederCode.set(o.feeder_code, arr);
    }
  }

  const gradeDistribution: Record<FeederGrade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let feedersWithOutages = 0;
  const feederResponses: FeederResponse[] = [];

  for (const feeder of feeders) {
    const health = calculateFeederHealth(feeder, outages);
    gradeDistribution[health.grade]++;

    // Use pre-grouped outages for extra fields
    const byId = outagesByFeederId.get(feeder.id) ?? [];
    const byCode = outagesByFeederCode.get(feeder.code) ?? [];
    const merged = byId.length >= byCode.length ? byId : byCode;
    const feederOutages30d = merged.filter((o) => o.date >= cutoffStr);

    if (feederOutages30d.length > 0) feedersWithOutages++;

    const totalDowntimeMin = feederOutages30d.reduce(
      (sum, o) => sum + (o.duration_minutes ?? 0),
      0
    );

    const causeCounts = new Map<string, number>();
    for (const o of feederOutages30d) {
      const cause = o.cause_subcategory ?? 'Unknown';
      causeCounts.set(cause, (causeCounts.get(cause) ?? 0) + 1);
    }
    let topCause: string | null = null;
    let topCount = 0;
    for (const [cause, count] of causeCounts) {
      if (count > topCount) {
        topCause = cause;
        topCount = count;
      }
    }

    const lastOutage = feederOutages30d
      .filter((o) => o.date)
      .sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;
        return (b.time_out ?? '').localeCompare(a.time_out ?? '');
      })[0];

    feederResponses.push({
      feeder_id: feeder.id,
      feeder_code: feeder.code,
      feeder_name: health.feeder_name,
      substation_code: feeder.substation_code,
      substation_name: `${feeder.substation_code} Substation`,
      area_served: feeder.area_served,
      customer_count: feeder.customer_count,
      health: {
        grade: health.grade,
        score: health.score,
        outages_30d: health.outages_30d,
        avg_duration_min: health.avg_duration_min,
        total_downtime_min: totalDowntimeMin,
        top_cause: topCause,
        trend: health.trend,
        last_outage_date: lastOutage?.date ?? null,
        last_outage_time: lastOutage?.time_out ?? null,
      },
    });
  }

  let filtered = feederResponses;

  if (substationFilter) {
    filtered = filtered.filter(
      (f) => f.substation_code.toUpperCase() === substationFilter.toUpperCase()
    );
  }

  if (gradeFilter && gradeFilter.length > 0) {
    const gradeSet = new Set(gradeFilter.map((g) => g.toUpperCase()));
    filtered = filtered.filter((f) => gradeSet.has(f.health.grade));
  }

  switch (sortParam) {
    case 'grade_asc':
      filtered.sort(
        (a, b) =>
          GRADE_ORDER.indexOf(a.health.grade) - GRADE_ORDER.indexOf(b.health.grade) ||
          a.health.score - b.health.score
      );
      break;
    case 'grade_desc':
      filtered.sort(
        (a, b) =>
          GRADE_ORDER.indexOf(b.health.grade) - GRADE_ORDER.indexOf(a.health.grade) ||
          b.health.score - a.health.score
      );
      break;
    case 'outages':
      filtered.sort((a, b) => b.health.outages_30d - a.health.outages_30d);
      break;
    case 'customers':
      filtered.sort((a, b) => b.customer_count - a.customer_count);
      break;
  }

  return NextResponse.json({
    feeders: filtered,
    summary: {
      total_feeders: feeders.length,
      feeders_with_outages: feedersWithOutages,
      grade_distribution: gradeDistribution,
    },
  });
}
