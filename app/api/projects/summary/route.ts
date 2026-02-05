import { NextResponse } from 'next/server';
import { getAgencySummary } from '@/lib/project-queries';

export async function GET() {
  try {
    const summary = await getAgencySummary();
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Summary error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 }
    );
  }
}
