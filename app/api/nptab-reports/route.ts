import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { createDraftFromQueue, listReports } from '@/lib/nptab/queries';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const auth = await requireRole(['dg', 'ps']);
  if (auth instanceof NextResponse) return auth;
  try {
    const reports = await listReports();
    return NextResponse.json({ reports });
  } catch (err) {
    logger.error({ err }, 'GET /api/nptab-reports failed');
    return NextResponse.json({ error: 'Failed to list reports' }, { status: 500 });
  }
}

export async function POST(_req: NextRequest) {
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  try {
    const report = await createDraftFromQueue(session.user.id);
    return NextResponse.json({ report, redirectTo: `/nptab-reports/${report.id}` });
  } catch (err) {
    logger.error({ err }, 'POST /api/nptab-reports failed');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
