import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('sub_agency, completion_pct, project_end_date')
      .gt('completion_pct', 0)
      .lt('completion_pct', 100)
      .lt('project_end_date', today);

    if (error) throw error;

    const counts: Record<string, number> = {};
    for (const row of data || []) {
      const agency = (row.sub_agency || '').toUpperCase();
      counts[agency] = (counts[agency] || 0) + 1;
    }

    return NextResponse.json({
      gpl: counts['GPL'] || 0,
      gwi: counts['GWI'] || 0,
      cjia: counts['CJIA'] || 0,
      gcaa: counts['GCAA'] || 0,
      heci: counts['HECI'] || 0,
      has: counts['HAS'] || 0,
      marad: counts['MARAD'] || 0,
      mopua: counts['MOPUA'] || 0,
      total: (data || []).length,
    });
  } catch (error) {
    console.error('Delayed counts error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch delayed counts' },
      { status: 500 }
    );
  }
}
