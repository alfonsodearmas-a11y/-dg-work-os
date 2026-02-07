import { NextResponse } from 'next/server';
import { getPortfolioSummary } from '@/lib/project-queries';

export async function GET() {
  try {
    const summary = await getPortfolioSummary();
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
  }
}
