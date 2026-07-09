import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { isOutreachConfigured, syncOutreach } from '@/lib/direct-outreach/opdirect';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  const authResult = await requireRole(['superadmin']);
  if (authResult instanceof NextResponse) return authResult;

  if (!isOutreachConfigured()) {
    return NextResponse.json(
      { error: 'OP Direct sync is not configured (OPDIRECT_API_TOKEN missing)' },
      { status: 503 },
    );
  }

  try {
    const result = await syncOutreach();
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err }, '[direct-outreach] manual sync failed');
    return NextResponse.json({ error: 'Sync from OP Direct failed' }, { status: 502 });
  }
}
