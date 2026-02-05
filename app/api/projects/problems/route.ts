import { NextResponse } from 'next/server';
import { getProblemProjects } from '@/lib/project-queries';

export async function GET() {
  try {
    const projects = await getProblemProjects();
    return NextResponse.json(projects);
  } catch (error) {
    console.error('Problem projects error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch problem projects' },
      { status: 500 }
    );
  }
}
