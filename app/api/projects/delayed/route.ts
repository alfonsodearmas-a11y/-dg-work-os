import { NextRequest, NextResponse } from 'next/server';
import { getDelayedProjects } from '@/lib/project-queries';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['superadmin', 'agency_manager']);
    if (authResult instanceof NextResponse) return authResult;

    // Optional agency scoping for bento "View all" deep-links from
    // /intel/[agency]. Canonical UPPERCASE per migration 106.
    const agency = request.nextUrl.searchParams.get('agency') || undefined;
    const projects = await getDelayedProjects(agency);
    return NextResponse.json(projects);
  } catch (error) {
    logger.error({ err: error }, 'Delayed projects error');
    return NextResponse.json({ error: 'Failed to fetch delayed projects' }, { status: 500 });
  }
}
