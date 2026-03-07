import { NextRequest, NextResponse } from 'next/server';
import { getProjectsList } from '@/lib/project-queries';
import { requireRole } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const p = request.nextUrl.searchParams;
    const { projects, total } = await getProjectsList({
      agency: p.get('agency') || undefined,
      status: p.get('status') || undefined,
      region: p.get('region') || undefined,
      search: p.get('search') || undefined,
      sort: p.get('sort') || undefined,
      page: p.get('page') ? parseInt(p.get('page')!) : undefined,
      limit: p.get('limit') ? parseInt(p.get('limit')!) : undefined,
    });
    return NextResponse.json({ projects, total });
  } catch (error) {
    console.error('Projects list error:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}
