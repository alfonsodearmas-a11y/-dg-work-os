import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getTaskStats } from '@/lib/task-queries';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  try {
    const url = request.nextUrl;
    const filters: any = {};
    if (url.searchParams.get('agency')) filters.agency = url.searchParams.get('agency');

    // Non-DG users can only see their own stats
    if (session.user.role !== 'dg') {
      filters.assignee_id = session.user.id;
    }

    const stats = await getTaskStats(filters);
    return NextResponse.json({ success: true, data: stats });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
