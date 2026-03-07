import { NextResponse } from 'next/server';
import { getDelayedProjects } from '@/lib/project-queries';
import { requireRole } from '@/lib/auth-helpers';

export async function GET() {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const projects = await getDelayedProjects();
    return NextResponse.json(projects);
  } catch (error) {
    console.error('Delayed projects error:', error);
    return NextResponse.json({ error: 'Failed to fetch delayed projects' }, { status: 500 });
  }
}
