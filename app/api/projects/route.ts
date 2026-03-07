import { NextRequest, NextResponse } from 'next/server';
import { getProjectsList } from '@/lib/project-queries';
import { requireRole } from '@/lib/auth-helpers';

// Backwards-compatible route — redirects to /api/projects/list logic
export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const p = request.nextUrl.searchParams;
    const { projects } = await getProjectsList({
      agency: p.get('agency') || undefined,
      status: p.get('status') || undefined,
      region: p.get('region') || undefined,
      search: p.get('search') || undefined,
      sort: p.get('sort') || undefined,
    });
    return NextResponse.json(projects);
  } catch (error) {
    console.error('Projects error:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}
