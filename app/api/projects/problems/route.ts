import { NextResponse } from 'next/server';
import { getDelayedProjects } from '@/lib/project-queries';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

// Problems = Delayed projects (past deadline)
export async function GET() {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const projects = await getDelayedProjects();
    return NextResponse.json(projects);
  } catch (error) {
    logger.error({ err: error }, 'Problem projects fetch failed');
    return NextResponse.json({ error: 'Failed to fetch problem projects' }, { status: 500 });
  }
}
