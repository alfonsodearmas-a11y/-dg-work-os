import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db-admin';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { calculateFeederHealth } from '@/lib/gpl/scoring';
import { mapOutageRow, mapFeederRow } from '@/lib/gpl/sync';
import { GPL_CONFIG } from '@/lib/gpl/config';
import type { TodayOutage, TodayResponse } from '@/lib/gpl/types';

function substationName(code: string): string {
  return GPL_CONFIG.substationNames[code] ?? `${code} Substation`;
}

function parseDateRange(params: URLSearchParams): { from: string; to: string } {
  const range = params.get('range') ?? 'today';
  const dateParam = params.get('date');
  const today = dateParam ?? new Date().toISOString().slice(0, 10);

  if (params.has('from') && params.has('to')) {
    return { from: params.get('from')!, to: params.get('to')! };
  }

  switch (range) {
    case 'yesterday': {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return { from: d.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) };
    }
    case 'week': {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    default:
      return { from: today, to: today };
  }
}

const OUTAGE_COLUMNS = 'outage_id,feeder_id,date,time_out,time_in,duration_minutes,customers_affected,mw_lost,ens_mwh,cause_category,cause_subcategory,cause_detail,root_cause,status,feeder_code,substation_code,areas_affected';
const FEEDER_COLUMNS = 'feeder_id,code,name,substation_code,area_served,customer_count';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  if (!canAccessAgency(session.user.role, session.user.agency, 'gpl')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const { from, to } = parseDateRange(params);

  // 30-day lookback for feeder health context
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 60); // 60d to cover trend calc (current 30d vs previous 30d)
  const lookbackDate = thirtyDaysAgo.toISOString().slice(0, 10);

  const [rangeResult, healthOutagesResult, feedersResult] = await Promise.all([
    supabaseAdmin
      .from('gpl_outage_cache')
      .select(OUTAGE_COLUMNS)
      .gte('date', from)
      .lte('date', to)
      .order('time_out', { ascending: false }),
    supabaseAdmin
      .from('gpl_outage_cache')
      .select(OUTAGE_COLUMNS)
      .gte('date', lookbackDate),
    supabaseAdmin
      .from('gpl_feeder_cache')
      .select(FEEDER_COLUMNS),
  ]);

  if (rangeResult.error) {
    return NextResponse.json({ error: rangeResult.error.message }, { status: 500 });
  }
  if (healthOutagesResult.error || feedersResult.error) {
    return NextResponse.json({ error: 'Failed to load feeder data' }, { status: 500 });
  }

  const rangeRows = rangeResult.data ?? [];
  const allOutages = (healthOutagesResult.data ?? []).map(mapOutageRow);
  const feeders = (feedersResult.data ?? []).map(mapFeederRow);
  const feederMap = new Map(feeders.map((f) => [f.code, f]));

  // Pre-compute feeder health only for feeders appearing in today's outages
  const feederHealthCache = new Map<string, ReturnType<typeof calculateFeederHealth>>();
  const seenFeeders = new Set(rangeRows.map((r) => r.feeder_code as string).filter(Boolean));
  for (const code of seenFeeders) {
    const feeder = feederMap.get(code);
    if (feeder) {
      feederHealthCache.set(code, calculateFeederHealth(feeder, allOutages));
    }
  }

  const outages: TodayOutage[] = rangeRows.map((r) => {
    const code = (r.feeder_code as string) ?? '';
    const feeder = feederMap.get(code);
    const health = feederHealthCache.get(code);

    return {
      id: r.outage_id as number,
      feeder_id: r.feeder_id as number,
      feeder_code: code,
      feeder_name: feeder?.name ?? code,
      substation_code: (r.substation_code as string) ?? '',
      substation_name: substationName((r.substation_code as string) ?? ''),
      date: r.date as string,
      time_out: r.time_out as string | null,
      time_in: r.time_in as string | null,
      duration_minutes: r.duration_minutes as number | null,
      customers_affected: r.customers_affected as number | null,
      mw_lost: r.mw_lost as number | null,
      ens_mwh: r.ens_mwh as number | null,
      cause_subcategory: r.cause_subcategory as string | null,
      cause_detail: r.cause_detail as string | null,
      status: r.status as string,
      areas_affected: r.areas_affected as string | null,
      feeder_health: {
        grade: health?.grade ?? 'C',
        score: health?.score ?? 50,
        outages_30d: health?.outages_30d ?? 0,
        avg_duration_30d: health?.avg_duration_min ?? 0,
        trend: health?.trend ?? 'stable',
      },
    };
  });

  // Active first (by time_out desc), then closed by time_out desc
  outages.sort((a, b) => {
    const aActive = a.status === 'open' ? 0 : 1;
    const bActive = b.status === 'open' ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return (b.time_out ?? '').localeCompare(a.time_out ?? '');
  });

  const active = outages.filter((o) => o.status === 'open').length;
  const restored = outages.filter((o) => o.status === 'closed').length;

  const response: TodayResponse = {
    date: from === to ? from : `${from} to ${to}`,
    summary: {
      active,
      restored,
      total: outages.length,
      total_customers_affected: outages.reduce((s, o) => s + (o.customers_affected ?? 0), 0),
      total_duration_minutes: outages.reduce((s, o) => s + (o.duration_minutes ?? 0), 0),
    },
    outages,
  };

  return NextResponse.json(response);
}
