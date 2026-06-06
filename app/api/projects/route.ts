import { NextRequest, NextResponse } from 'next/server';
import { getProjectsList } from '@/lib/project-queries';
import { requireRole } from '@/lib/auth-helpers';
import { getViewAsAgencyScope } from '@/lib/scoped-query';
import { logger } from '@/lib/logger';

// Backwards-compatible route — redirects to /api/projects/list logic
export async function GET(request: NextRequest) {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  try {
    const p = request.nextUrl.searchParams;

    // Agency scoping: non-ministry users are locked to their agency's projects
    const viewAsRole = session.user.role === 'superadmin' ? p.get('viewAsRole') : null;
    const viewAsAgency = session.user.role === 'superadmin' ? p.get('viewAsAgency') : null;
    const scope = getViewAsAgencyScope(session, viewAsRole, viewAsAgency);
    const agency = scope?.toUpperCase() || p.get('agency') || undefined;

    const { projects } = await getProjectsList({
      agency,
      status: p.get('status') || undefined,
      region: p.get('region') || undefined,
      search: p.get('search') || undefined,
      sort: p.get('sort') || undefined,
    });
    return NextResponse.json(projects);
  } catch (error) {
    logger.error({ err: error }, 'Projects list fetch failed');
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}
