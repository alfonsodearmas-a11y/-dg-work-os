import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  try {
    const { data: outliers, error } = await supabaseAdmin
      .from('gpl_chronic_outliers')
      .select('*')
      .eq('resolved', false)
      .order('latest_days_elapsed', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ outliers: outliers ?? [] });
  } catch (err) {
    console.error('[gpl/sc-outliers] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
