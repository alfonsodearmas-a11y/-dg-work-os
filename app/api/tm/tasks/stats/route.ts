import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, isDG, AuthError } from '@/lib/auth';
import { getTaskStats } from '@/lib/task-queries';

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateAny(request);
    const url = request.nextUrl;

    const filters: any = {};
    if (url.searchParams.get('agency')) filters.agency = url.searchParams.get('agency');

    // CEOs can only see their own stats
    if (!isDG(user)) {
      filters.assignee_id = user.id;
    }

    const stats = await getTaskStats(filters);
    return NextResponse.json({ success: true, data: stats });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
