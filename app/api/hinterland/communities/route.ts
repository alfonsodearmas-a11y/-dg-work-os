import { NextRequest, NextResponse } from 'next/server';
import { requireHinterlandAccess } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { WATER_STATUSES } from '@/lib/hinterland-types';
import type { CommunityListRow, WaterStatusValue } from '@/lib/hinterland-types';
import { buildCommunitySummary } from '@/lib/hinterland/queries';

// ── GET /api/hinterland/communities ───────────────────────────────────────────
// Full community list (community fields + water summary) + estate summary.
// Filtering / sorting are supported for direct API use; the summary is always
// computed over the FULL estate so KPI tiles stay stable regardless of filters.

// Raw row shape from the embedded select. water_status is 1:1 (unique FK) so
// PostgREST may hand it back as an object or a single-element array — normalize.
interface RawCommunityRow {
  [key: string]: unknown;
  id: string;
  name: string;
  region: number;
  nearest_airstrip_id: string | null;
  water_status: { status: string; coverage_percent: number | null } | { status: string; coverage_percent: number | null }[] | null;
  water_sources: { source_type: string | null }[] | null;
}

function toListRow(row: RawCommunityRow): CommunityListRow {
  const ws = Array.isArray(row.water_status) ? row.water_status[0] : row.water_status;
  const status = (ws?.status ?? 'unknown') as WaterStatusValue;
  const sources = row.water_sources ?? [];
  const source_types = [...new Set(sources.map(s => s.source_type).filter((t): t is string => !!t))];
  const { water_status, water_sources, ...community } = row;
  void water_status; void water_sources;
  return {
    ...(community as unknown as CommunityListRow),
    water_status: WATER_STATUSES.includes(status) ? status : 'unknown',
    coverage_percent: ws?.coverage_percent != null ? Number(ws.coverage_percent) : null,
    water_source_count: sources.length,
    source_types,
    has_airstrip: row.nearest_airstrip_id != null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireHinterlandAccess();
    if (authResult instanceof NextResponse) return authResult;

    const p = request.nextUrl.searchParams;
    const search = (p.get('search') || '').trim().toLowerCase();
    const region = p.get('region') || '';
    const status = p.get('status') || '';
    const sourceType = p.get('source_type') || '';
    const sortField = p.get('sort') || 'name';
    const sortDir = p.get('dir') === 'desc' ? 'desc' : 'asc';

    const { data, error } = await supabaseAdmin
      .from('communities')
      .select('*, water_status(status, coverage_percent), water_sources(source_type)')
      .order('name', { ascending: true });

    if (error) throw error;

    const allRows = (data as RawCommunityRow[] | null ?? []).map(toListRow);

    // Summary over the FULL estate (stable KPIs + per-region rollup for the map stand-in).
    const summary = buildCommunitySummary(allRows);

    // Filters (applied to the returned list only).
    let rows = allRows;
    if (search) {
      rows = rows.filter(r =>
        `${r.name} ${r.sub_district ?? ''} ${r.remarks ?? ''}`.toLowerCase().includes(search));
    }
    if (region) rows = rows.filter(r => r.region === Number(region));
    if (status && (WATER_STATUSES as readonly string[]).includes(status)) {
      rows = rows.filter(r => r.water_status === status);
    }
    if (sourceType) rows = rows.filter(r => r.source_types.includes(sourceType));

    // Sort.
    const dirMul = sortDir === 'asc' ? 1 : -1;
    const val = (r: CommunityListRow): string | number => {
      switch (sortField) {
        case 'region': return r.region;
        case 'population': return r.population ?? -1;
        case 'coverage': return r.coverage_percent ?? -1;
        case 'status': return WATER_STATUSES.indexOf(r.water_status);
        case 'name':
        default: return r.name.toLowerCase();
      }
    };
    rows = [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -1 * dirMul;
      if (va > vb) return 1 * dirMul;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      communities: rows,
      summary,
      filters: { regions: summary.regions.map(r => r.region) },
    });
  } catch (error) {
    logger.error({ err: error }, 'Hinterland communities list error');
    return NextResponse.json({ error: 'Failed to fetch communities' }, { status: 500 });
  }
}
