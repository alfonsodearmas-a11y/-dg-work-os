import { NextRequest, NextResponse } from 'next/server';
import { requireAirstripAccess } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { AirstripStatus, SurfaceCondition } from '@/lib/airstrip-types';
import { AIRSTRIP_STATUSES, SURFACE_CONDITIONS, FLIGHT_FREQUENCIES, guyanaToday } from '@/lib/airstrip-types';
import { getAirstripSettings, augmentAirstrip, type AirstripOverviewRow } from '@/lib/airstrips/queries';
import { z } from 'zod';
import { parseBody } from '@/lib/api-utils';

// ── GET /api/airstrips ────────────────────────────────────────────────────────
// Returns airstrips list + summary stats. Supports filtering & sorting.

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAirstripAccess();
    if (authResult instanceof NextResponse) return authResult;

    const p = request.nextUrl.searchParams;

    // Parse filters
    const search = p.get('search') || '';
    const region = p.get('region') || '';
    const status = p.get('status') || '';
    const condition = p.get('condition') || '';
    const frequency = p.get('frequency') || '';
    const sortField = p.get('sort') || 'name';
    const sortDir = p.get('dir') === 'desc' ? false : true; // ascending by default

    // ── Build query ── (airstrip_overview adds derived cadence inputs + responsibility)
    let query = supabaseAdmin
      .from('airstrip_overview')
      .select('*');

    if (search) {
      // Strip PostgREST filter-syntax characters to prevent filter injection
      const safe = search.replace(/[,%()]/g, '');
      if (safe) {
        query = query.or(`name.ilike.%${safe}%,surface_type.ilike.%${safe}%,remarks.ilike.%${safe}%`);
      }
    }
    if (region) {
      query = query.eq('region', parseInt(region));
    }
    if (status && AIRSTRIP_STATUSES.includes(status as AirstripStatus)) {
      query = query.eq('status', status);
    }
    if (condition && SURFACE_CONDITIONS.includes(condition as SurfaceCondition)) {
      query = query.eq('surface_condition', condition);
    }
    if (frequency && (FLIGHT_FREQUENCIES as readonly string[]).includes(frequency)) {
      query = query.eq('flight_frequency', frequency);
    }

    // Sorting
    const validSortFields = [
      'name', 'region', 'runway_length_m', 'runway_width_m',
      'surface_condition', 'last_inspection_date', 'flight_frequency', 'status',
    ];
    const resolvedSort = validSortFields.includes(sortField) ? sortField : 'name';
    query = query.order(resolvedSort, { ascending: sortDir, nullsFirst: false });

    // Run the list query, the settings load, and the pending-verification count in parallel
    const [airstripResult, settings, verificationResult] = await Promise.all([
      query,
      getAirstripSettings(),
      supabaseAdmin
        .from('airstrip_maintenance_log')
        .select('*', { count: 'exact', head: true })
        .eq('verified', false),
    ]);

    if (airstripResult.error) throw airstripResult.error;

    const today = guyanaToday();
    const airstrips = (airstripResult.data as AirstripOverviewRow[] | null ?? []).map(
      row => augmentAirstrip(row, settings, today),
    );

    // Single-pass summary stats — overdue derives from cadence (replaces the old
    // 6-month inspection heuristic). Counts use each strip's primary attention level.
    const regions = new Set<number>();
    const summary = airstrips.reduce(
      (acc, a) => {
        acc.total++;
        if (a.status === 'operational') acc.operational++;
        else if (a.status === 'limited' || a.status === 'under_rehabilitation') acc.limited_or_rehab++;
        else if (a.status === 'closed') acc.closed++;
        const lvl = a.cadence.attentionLevel;
        if (lvl !== 'ok') acc.needs_attention++;
        if (lvl === 'overdue') acc.overdue++;
        else if (lvl === 'upcoming') acc.upcoming++;
        else if (lvl === 'stale') acc.verification_stale++;
        regions.add(a.region as number);
        return acc;
      },
      { total: 0, operational: 0, limited_or_rehab: 0, closed: 0,
        needs_attention: 0, overdue: 0, upcoming: 0, verification_stale: 0 },
    );

    const distinctRegions = [...regions].sort((a, b) => a - b);

    return NextResponse.json({
      airstrips,
      summary: { ...summary, pending_verification: verificationResult.count ?? 0 },
      filters: { regions: distinctRegions },
    });
  } catch (error) {
    logger.error({ err: error }, 'Airstrips list error');
    return NextResponse.json({ error: 'Failed to fetch airstrips' }, { status: 500 });
  }
}

// ── POST /api/airstrips ───────────────────────────────────────────────────────
// Create a new airstrip.

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  region: z.number().int().min(1).max(10),
  status: z.enum(AIRSTRIP_STATUSES).default('operational'),
  engineered_structure: z.boolean().default(false),
  runway_length_m: z.number().positive().nullable().optional(),
  runway_width_m: z.number().positive().nullable().optional(),
  surface_type: z.string().trim().nullable().optional(),
  surface_condition: z.enum(SURFACE_CONDITIONS).nullable().optional(),
  flight_frequency: z.enum(FLIGHT_FREQUENCIES).nullable().optional(),
  last_inspection_date: z.string().nullable().optional(),
  airside_buildings: z.string().trim().nullable().optional(),
  remarks: z.string().trim().nullable().optional(),
  coordinates_lat: z.number().min(-90).max(90).nullable().optional(),
  coordinates_lon: z.number().min(-180).max(180).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAirstripAccess();
    if (authResult instanceof NextResponse) return authResult;
    const { session } = authResult;

    const { data, error: validationError } = await parseBody(request, createSchema);
    if (validationError) return validationError;

    // Check unique name
    const { data: existing } = await supabaseAdmin
      .from('airstrips')
      .select('id')
      .ilike('name', data.name)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'An airstrip with this name already exists', field: 'name' }, { status: 409 });
    }

    const { name, region, status, engineered_structure, ...optionalFields } = data;
    const { data: airstrip, error } = await supabaseAdmin
      .from('airstrips')
      .insert({
        name, region, status, engineered_structure,
        ...optionalFields,
        created_by: session.user.id,
        updated_by: session.user.id,
      })
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ airstrip }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, 'Create airstrip error');
    return NextResponse.json({ error: 'Failed to create airstrip' }, { status: 500 });
  }
}
