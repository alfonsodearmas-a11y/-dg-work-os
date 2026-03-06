import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stage = searchParams.get('stage');
    const staff = searchParams.get('staff');
    const snapshotFrom = searchParams.get('snapshot_from');
    const snapshotTo = searchParams.get('snapshot_to');
    const breachOnly = searchParams.get('breach') === 'true';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');

    // Get snapshot IDs in range if specified
    let snapshotIds: string[] | null = null;
    if (snapshotFrom || snapshotTo) {
      let snapQuery = supabaseAdmin.from('gpl_snapshots').select('id');
      if (snapshotFrom) snapQuery = snapQuery.gte('snapshot_date', snapshotFrom);
      if (snapshotTo) snapQuery = snapQuery.lte('snapshot_date', snapshotTo);
      const { data: snaps } = await snapQuery;
      snapshotIds = snaps?.map(s => s.id) ?? [];
    } else {
      // Default to latest snapshot
      const { data: latest } = await supabaseAdmin
        .from('gpl_snapshots')
        .select('id')
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();
      if (latest) snapshotIds = [latest.id];
    }

    if (!snapshotIds || snapshotIds.length === 0) {
      return NextResponse.json({ records: [], total: 0, page: 1, totalPages: 0 });
    }

    let query = supabaseAdmin
      .from('gpl_completed')
      .select('*', { count: 'exact' })
      .in('snapshot_id', snapshotIds);

    if (stage) query = query.eq('stage', stage);
    if (staff) query = query.eq('created_by', staff);

    query = query.order('days_taken_calculated', { ascending: false, nullsFirst: false });

    const offset = (page - 1) * pageSize;
    query = query.range(offset, offset + pageSize - 1);

    const { data: records, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Tag with SLA info
    const SLA_MAP: Record<string, number> = { 'A:metering': 3, 'B:design': 12, 'B:execution': 30 };
    let tagged = (records ?? []).map(r => {
      const slaTarget = SLA_MAP[`${r.track}:${r.stage}`] ?? 30;
      const days = r.days_taken_calculated ?? r.days_taken ?? 0;
      const is_breach = !r.is_data_quality_error && days > slaTarget;
      return { ...r, sla_target: slaTarget, is_breach };
    });

    if (breachOnly) {
      tagged = tagged.filter(r => r.is_breach);
    }

    return NextResponse.json({
      records: tagged,
      total: breachOnly ? tagged.length : (count ?? 0),
      page,
      totalPages: Math.ceil((breachOnly ? tagged.length : (count ?? 0)) / pageSize),
    });
  } catch (err) {
    console.error('[gpl/sc-completed] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
