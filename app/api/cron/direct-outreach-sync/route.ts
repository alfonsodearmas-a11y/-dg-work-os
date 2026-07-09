import { NextRequest, NextResponse } from 'next/server';
import { isOutreachConfigured, syncOutreach } from '@/lib/direct-outreach/opdirect';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function verifyCron(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const secret = request.headers.get('authorization')?.replace('Bearer ', '') || '';
  return secret.length === cronSecret.length && secret === cronSecret;
}

// Vercel crons use GET
export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isOutreachConfigured()) {
    // Not an error state worth alerting on — the module simply isn't wired up yet.
    logger.warn('[direct-outreach] cron sync skipped — OPDIRECT_API_TOKEN missing');
    return NextResponse.json({ skipped: true, reason: 'OPDIRECT_API_TOKEN missing' });
  }

  try {
    const result = await syncOutreach();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.error({ err }, '[direct-outreach] cron sync failed');
    return NextResponse.json({ error: 'Sync from OP Direct failed' }, { status: 502 });
  }
}
