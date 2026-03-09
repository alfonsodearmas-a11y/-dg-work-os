import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const track = searchParams.get('track');
    const stage = searchParams.get('stage');
    const slaStatus = searchParams.get('sla_status');
    const search = searchParams.get('search');
    const sortField = searchParams.get('sort') || 'days_elapsed';
    const sortOrder = searchParams.get('order') || 'desc';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');

    // Get latest snapshot
    const { data: latestSnapshot } = await supabaseAdmin
      .from('gpl_snapshots')
      .select('id')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    if (!latestSnapshot) {
      return NextResponse.json({ records: [], total: 0, page: 1, totalPages: 0 });
    }

    let query = supabaseAdmin
      .from('gpl_outstanding')
      .select('*', { count: 'exact' })
      .eq('snapshot_id', latestSnapshot.id);

    if (track) query = query.eq('track', track);
    if (stage) query = query.eq('stage', stage);
    if (search) {
      const sanitized = search.replace(/[%_.*(),"\\]/g, '');
      if (sanitized) {
        query = query.or(`customer_name.ilike.%${sanitized}%,account_number.ilike.%${sanitized}%,town_city.ilike.%${sanitized}%`);
      }
    }

    // SLA status filtering
    if (slaStatus === 'within') {
      // We need to filter by SLA — join with stage info is complex, filter client-side
    }

    const ascending = sortOrder === 'asc';
    query = query.order(sortField, { ascending, nullsFirst: false });

    const offset = (page - 1) * pageSize;
    query = query.range(offset, offset + pageSize - 1);

    const { data: records, count, error } = await query;

    if (error) {
      logger.error({ err: error, message: error.message }, 'GPL SC outstanding DB query failed');
      return NextResponse.json({ error: 'Failed to fetch records' }, { status: 500 });
    }

    // Get SLA targets for tagging
    const SLA_MAP: Record<string, number> = { 'A:metering': 3, 'B:design': 12, 'B:execution': 30 };
    const taggedRecords = (records ?? []).map(r => {
      const slaTarget = SLA_MAP[`${r.track}:${r.stage}`] ?? 30;
      const days = r.days_elapsed ?? r.days_elapsed_calculated ?? 0;
      let sla_status: 'within' | 'breach' | 'severe' = 'within';
      if (days > slaTarget * 2) sla_status = 'severe';
      else if (days > slaTarget) sla_status = 'breach';
      return { ...r, sla_target: slaTarget, sla_status };
    });

    // Client-side SLA filter if requested
    const filtered = slaStatus
      ? taggedRecords.filter(r => r.sla_status === slaStatus)
      : taggedRecords;

    return NextResponse.json({
      records: filtered,
      total: slaStatus ? filtered.length : (count ?? 0),
      page,
      totalPages: Math.ceil((slaStatus ? filtered.length : (count ?? 0)) / pageSize),
    });
  } catch (err) {
    logger.error({ err }, 'GPL SC outstanding records fetch failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
