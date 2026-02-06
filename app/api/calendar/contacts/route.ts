import { NextResponse } from 'next/server';
import { searchCalendarContacts, getRecentContacts } from '@/lib/calendar-contacts';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    const contacts = query
      ? await searchCalendarContacts(query)
      : await getRecentContacts(10);

    return NextResponse.json(contacts);
  } catch (error) {
    console.error('Failed to fetch contacts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    );
  }
}
