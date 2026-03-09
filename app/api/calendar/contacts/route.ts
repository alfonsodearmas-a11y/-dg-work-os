import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { searchCalendarContacts, getRecentContacts } from '@/lib/calendar-contacts';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    const contacts = query
      ? await searchCalendarContacts(query)
      : await getRecentContacts(10);

    return NextResponse.json(contacts);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch calendar contacts');
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    );
  }
}
