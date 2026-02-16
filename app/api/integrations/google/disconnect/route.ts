import { NextResponse } from 'next/server';
import { deleteGoogleCalendarToken } from '@/lib/integration-tokens';
import { invalidateCalendarClientCache } from '@/lib/google-calendar';

export async function POST() {
  try {
    await deleteGoogleCalendarToken();
    invalidateCalendarClientCache();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Google Disconnect] Error:', err);
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
