import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db-admin';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const authResult = await requireRole(['superadmin', 'agency_manager']);
    if (authResult instanceof NextResponse) return authResult;

    const { data, error } = await supabaseAdmin
      .from('project_uploads')
      .select('id, filename, uploaded_at, row_count, changes_summary')
      .order('uploaded_at', { ascending: false })
      .limit(10);

    if (error) {
      logger.error({ err: error }, 'Project changes select failed');
      return NextResponse.json({ error: 'Failed to fetch changes' }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    logger.error({ err: error }, 'Project changes fetch failed');
    return NextResponse.json({ error: 'Failed to fetch changes' }, { status: 500 });
  }
}
