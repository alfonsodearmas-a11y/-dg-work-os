import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const { data } = await supabaseAdmin
      .from('project_uploads')
      .select('id, filename, uploaded_at, uploaded_by, record_count, status, summary')
      .order('uploaded_at', { ascending: false })
      .limit(10);

    return NextResponse.json(data || []);
  } catch (error) {
    logger.error({ err: error }, 'Project changes fetch failed');
    return NextResponse.json({ error: 'Failed to fetch changes' }, { status: 500 });
  }
}
