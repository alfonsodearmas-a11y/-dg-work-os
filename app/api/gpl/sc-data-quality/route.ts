import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    const { data: snapshots, error } = await supabaseAdmin
      .from('gpl_snapshots')
      .select('id, snapshot_date, data_quality_warnings, warning_count, track_a_outstanding, track_a_completed, track_b_design_outstanding, track_b_execution_outstanding, track_b_design_completed, track_b_execution_completed')
      .order('snapshot_date', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch data quality information' }, { status: 500 });
    }

    return NextResponse.json({ snapshots: snapshots ?? [] });
  } catch (err) {
    console.error('[gpl/sc-data-quality] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
