import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { deleteGoogleCalendarToken } from '@/lib/integration-tokens';
import { invalidateCalendarClientCache } from '@/lib/google-calendar';
import { withErrorHandler } from '@/lib/api-utils';

export const POST = withErrorHandler(async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  await deleteGoogleCalendarToken(userId);
  invalidateCalendarClientCache(userId);

  return NextResponse.json({ ok: true });
});
