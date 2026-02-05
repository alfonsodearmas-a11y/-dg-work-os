import { NextResponse } from 'next/server';
import { getDelayedProjects } from '@/lib/project-queries';

export async function GET() {
  try {
    const projects = await getDelayedProjects();
    return NextResponse.json(projects);
  } catch (error) {
    console.error('Delayed projects error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch delayed projects' },
      { status: 500 }
    );
  }
}
