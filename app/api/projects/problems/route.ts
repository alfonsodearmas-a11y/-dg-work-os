import { NextResponse } from 'next/server';
import { getDelayedProjects } from '@/lib/project-queries';

// Problems = Delayed projects (past deadline)
export async function GET() {
  try {
    const projects = await getDelayedProjects();
    return NextResponse.json(projects);
  } catch (error) {
    console.error('Problem projects error:', error);
    return NextResponse.json({ error: 'Failed to fetch problem projects' }, { status: 500 });
  }
}
