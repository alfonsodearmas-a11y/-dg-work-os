import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runDriftDetector } from '@/lib/action-items/matcher/drift';

export const dynamic = 'force-dynamic';

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
  const result = await runDriftDetector();
  return NextResponse.json(result);
}

export { handler as GET, handler as POST };
