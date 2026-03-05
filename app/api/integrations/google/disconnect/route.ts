import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { deleteGoogleCalendarToken } from '@/lib/integration-tokens';
import { invalidateCalendarClientCache } from '@/lib/google-calendar';

export async function POST() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    await deleteGoogleCalendarToken(userId);
    invalidateCalendarClientCache(userId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Google Disconnect] Error:', err);
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
