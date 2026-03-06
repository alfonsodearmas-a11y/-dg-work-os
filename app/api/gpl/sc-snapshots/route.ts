import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  try {
    const { data: snapshots, error } = await supabaseAdmin
      .from('gpl_snapshots')
      .select('id, snapshot_date, uploaded_at, file_name, track_a_outstanding, track_a_completed, track_b_design_outstanding, track_b_execution_outstanding, track_b_design_completed, track_b_execution_completed, track_b_total_outstanding, warning_count')
      .order('snapshot_date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ snapshots: snapshots ?? [] });
  } catch (err) {
    console.error('[gpl/sc-snapshots] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
