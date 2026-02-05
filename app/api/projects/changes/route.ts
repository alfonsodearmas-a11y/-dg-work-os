import { NextResponse } from 'next/server';
import { getLatestChanges } from '@/lib/project-queries';

export async function GET() {
  try {
    const changes = await getLatestChanges();
    return NextResponse.json(changes || { message: 'No recent changes' });
  } catch (error) {
    console.error('Changes error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch changes' },
      { status: 500 }
    );
  }
}
