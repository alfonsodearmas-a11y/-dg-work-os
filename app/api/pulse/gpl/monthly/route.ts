import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { aggregateMonthly } from '@/lib/gpl/scoring';
import type { GplOutage, GplFeeder } from '@/lib/gpl/types';

const SUBSTATION_NAMES: Record<string, string> = {
  SOPHIA: 'Sophia',
  GOE: 'Garden of Eden',
  DP3: 'Demerara Power 3',
  DP4: 'Demerara Power 4',
  'N/GT': 'New Georgetown',
  'G/HOPE': 'Good Hope',
  'G/GROVE': 'Grove',
  COLUMBIA: 'Columbia',
  ONVERWAGT: 'Onverwagt',
  SKELDON: 'Skeldon',
  'V/HOOP': 'Vreed-en-Hoop',
  'E/BERG': 'Enmore/Berg',
  '#53': 'Station #53',
  'C/FIELD': 'Canefield',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pctDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  if (!canAccessAgency(session.user.role, session.user.agency, 'gpl')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 4, 1);
  const from = searchParams.get('from') ?? defaultFrom.toISOString().slice(0, 7);
  const to = searchParams.get('to') ?? now.toISOString().slice(0, 7);

  const fromDate = `${from}-01`;
  const toYear = parseInt(to.slice(0, 4));
  const toMonth = parseInt(to.slice(5, 7));
  const lastDay = new Date(toYear, toMonth, 0).getDate();
  const toDate = `${to}-${String(lastDay).padStart(2, '0')}`;

  try {
    const [outagesResult, feedersResult] = await Promise.all([
      supabaseAdmin
        .from('gpl_outage_cache')
        .select('*')
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: true }),
      supabaseAdmin
        .from('gpl_feeder_cache')
        .select('feeder_id, code, name, substation_code, customer_count'),
    ]);

    if (outagesResult.error) throw outagesResult.error;
    if (feedersResult.error) throw feedersResult.error;

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
      area_served: null,
      customer_count: r.customer_count,
    }));

    const feederMap = new Map(feeders.map((f) => [f.code, f]));
    const summaries = aggregateMonthly(outages, feeders);

    // Check for long outages per month (> 120 min)
    const longOutageByMonth = new Map<string, boolean>();
    for (const o of outages) {
      if (!o.date) continue;
      const m = o.date.slice(0, 7);
      if ((o.duration_minutes ?? 0) > 120) {
        longOutageByMonth.set(m, true);
      }
    }

    const currentMonth = now.toISOString().slice(0, 7);

    const months = summaries.map((s, i) => {
      const [year, monthNum] = s.month.split('-').map(Number);
      const label = `${MONTH_NAMES[monthNum - 1]} ${year}`;

      let vs_previous: {
        outage_count_delta_pct: number;
        avg_duration_delta_pct: number;
        ens_delta_pct: number;
      } | null = null;

      if (i > 0) {
        const prev = summaries[i - 1];
        vs_previous = {
          outage_count_delta_pct: pctDelta(s.outage_count, prev.outage_count),
          avg_duration_delta_pct: pctDelta(s.avg_duration_min, prev.avg_duration_min),
          ens_delta_pct: pctDelta(s.total_ens_mwh, prev.total_ens_mwh),
        };
      }

      return {
        month: s.month,
        label,
        outage_count: s.outage_count,
        avg_duration_minutes: s.avg_duration_min,
        total_ens_mwh: s.total_ens_mwh,
        total_customers_affected: s.total_customers_affected,
        has_long_outage: longOutageByMonth.get(s.month) ?? false,
        is_current: s.month === currentMonth,
        vs_previous,
        by_substation: s.by_substation.map((sub) => ({
          code: sub.substation_code,
          name: SUBSTATION_NAMES[sub.substation_code] ?? sub.substation_code,
          count: sub.outage_count,
        })),
        by_cause: s.by_cause.map((c) => ({
          subcategory: c.cause_subcategory,
          count: c.count,
          pct: c.pct,
        })),
        worst_feeders: s.worst_feeders.map((f) => {
          const feeder = feederMap.get(f.feeder_code);
          return {
            feeder_code: f.feeder_code,
            substation_code: feeder?.substation_code ?? '',
            display: feeder
              ? `${feeder.substation_code}/${f.feeder_code}`
              : f.feeder_code,
            count: f.outage_count,
            customer_count: feeder?.customer_count ?? 0,
          };
        }),
      };
    });

    return NextResponse.json({ months });
  } catch (error) {
    console.error('Monthly aggregation failed:', error);
    return NextResponse.json(
      { error: 'Failed to load monthly performance data' },
      { status: 500 },
    );
  }
}
