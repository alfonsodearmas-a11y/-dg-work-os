import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { parseNaturalLanguageEvent } from '@/lib/calendar-nlp';

export async function POST(request: Request) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { input } = await request.json();

    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      return NextResponse.json({ error: 'Input text is required' }, { status: 400 });
    }

    const parsed = await parseNaturalLanguageEvent(input.trim());
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Failed to parse event:', error);
    return NextResponse.json(
      { error: 'Failed to parse event description' },
      { status: 500 }
    );
  }
}
