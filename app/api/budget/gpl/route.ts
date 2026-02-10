import { NextResponse } from 'next/server';
import { getGplDetail } from '@/lib/budget-db';

export async function GET() {
  try {
    const data = getGplDetail();
    return NextResponse.json(data);
  } catch (error) {
    console.error('GPL detail error:', error);
    return NextResponse.json({ error: 'Failed to load GPL detail' }, { status: 500 });
  }
}
