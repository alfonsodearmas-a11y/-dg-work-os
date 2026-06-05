import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runFirefliesPoll } from '@/lib/action-items/fireflies/poll';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export { handler as GET, handler as POST };

async function handler(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  let isAuthed = isCron;
  if (!isAuthed) {
    const session = await auth();
    isAuthed = !!session?.user?.id && session.user.role === 'superadmin';
  }
  if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await runFirefliesPoll();
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err }, 'poll-fireflies failed');
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Poll failed' }, { status: 500 });
  }
}
