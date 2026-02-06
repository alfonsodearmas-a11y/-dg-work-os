import { NextResponse } from 'next/server';
import { parseNaturalLanguageEvent } from '@/lib/calendar-nlp';

export async function POST(request: Request) {
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
