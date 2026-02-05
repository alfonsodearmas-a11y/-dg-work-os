import { NextRequest, NextResponse } from 'next/server';
import { getProjects } from '@/lib/project-queries';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agency = searchParams.get('agency') || undefined;
    const status = searchParams.get('status') || undefined;
    const year = searchParams.get('year');

    const projects = await getProjects({
      agency,
      status,
      year: year ? parseInt(year) : undefined
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error('Projects list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}
