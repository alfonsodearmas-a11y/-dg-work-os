import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { data: outliers, error } = await supabaseAdmin
      .from('gpl_chronic_outliers')
      .select('*')
      .eq('resolved', false)
      .order('latest_days_elapsed', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch outlier records' }, { status: 500 });
    }

    return NextResponse.json({ outliers: outliers ?? [] });
  } catch (err) {
    logger.error({ err }, 'GPL SC outliers fetch failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
