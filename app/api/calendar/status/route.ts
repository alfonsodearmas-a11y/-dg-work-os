import { NextResponse } from 'next/server';
import { testCalendarConnection } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

/** GET /api/calendar/status — check Google Calendar connection health */
export async function GET() {
  const status = await testCalendarConnection();
  return NextResponse.json(status, {
    status: status.ok ? 200 : 503,
  });
}
