import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { data: snapshots, error } = await supabaseAdmin
      .from('gpl_snapshots')
      .select('id, snapshot_date, uploaded_at, file_name, track_a_outstanding, track_a_completed, track_b_design_outstanding, track_b_execution_outstanding, track_b_design_completed, track_b_execution_completed, track_b_total_outstanding, warning_count')
      .order('snapshot_date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch snapshots' }, { status: 500 });
    }

    return NextResponse.json({ snapshots: snapshots ?? [] });
  } catch (err) {
    logger.error({ err }, 'GPL SC snapshots fetch failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
