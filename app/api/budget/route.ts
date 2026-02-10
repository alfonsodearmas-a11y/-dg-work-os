import { NextResponse } from 'next/server';
import { getSummary } from '@/lib/budget-db';

export async function GET() {
  try {
    const data = getSummary();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Budget summary error:', error);
    return NextResponse.json({ error: 'Failed to load budget summary' }, { status: 500 });
  }
}
