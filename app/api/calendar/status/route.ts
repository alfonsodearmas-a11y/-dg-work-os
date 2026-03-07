import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { testCalendarConnection } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

/** GET /api/calendar/status — check Google Calendar connection health */
export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const status = await testCalendarConnection();
  return NextResponse.json(status, {
    status: status.ok ? 200 : 503,
  });
}
