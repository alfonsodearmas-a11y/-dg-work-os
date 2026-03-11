import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

const PROJECT_LIST_COLUMNS = 'id, project_id, executing_agency, sub_agency, project_name, short_name, region, tender_board_type, contract_value, contractor, project_end_date, completion_pct, health, escalated, escalation_reason, assigned_to, start_date, revised_start_date, project_status, project_extended, created_at, updated_at';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const from = (page - 1) * limit;

    const { data, error, count } = await supabaseAdmin
      .from('projects')
      .select(PROJECT_LIST_COLUMNS, { count: 'exact' })
      .order('contract_value', { ascending: false, nullsFirst: false })
      .range(from, from + limit - 1);

    if (error) {
      logger.error({ err: error }, 'Projects fetch error');
      return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }

    return NextResponse.json({
      count: count || 0,
      projects: data || [],
      page,
      limit,
      pages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    logger.error({ err: error }, 'Projects all error');
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}
