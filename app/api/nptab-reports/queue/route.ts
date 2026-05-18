import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import {
  dequeueTender,
  getActiveQueueRowForTender,
  listActiveQueue,
  queueTender,
} from '@/lib/nptab/queries';
import { EmDashError } from '@/lib/referrals/em-dash-guard';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireRole(['dg', 'ps']);
  if (auth instanceof NextResponse) return auth;
  const tenderId = request.nextUrl.searchParams.get('tender_id');
  try {
    if (tenderId) {
      const row = await getActiveQueueRowForTender(tenderId);
      return NextResponse.json({ row });
    }
    const queue = await listActiveQueue();
    return NextResponse.json({ queue });
  } catch (err) {
    logger.error({ err }, 'GET /api/nptab-reports/queue failed');
    return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  let body: { tender_id?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.tender_id !== 'string' || !body.tender_id) {
    return NextResponse.json({ error: 'tender_id is required' }, { status: 400 });
  }
  const reason = typeof body.reason === 'string' ? body.reason : null;
  try {
    const row = await queueTender(body.tender_id, session.user.id, reason);
    return NextResponse.json({ id: row.id });
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    if (code === 'ALREADY_QUEUED') {
      const existing = await getActiveQueueRowForTender(body.tender_id as string);
      return NextResponse.json(
        { error: (err as Error).message, queueId: existing?.id ?? null },
        { status: 409 },
      );
    }
    if (err instanceof EmDashError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    logger.error({ err, tenderId: body.tender_id }, 'POST queue failed');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  const queueId = request.nextUrl.searchParams.get('queue_id');
  if (!queueId) {
    return NextResponse.json({ error: 'queue_id query param required' }, { status: 400 });
  }
  const reason = request.nextUrl.searchParams.get('reason');
  try {
    await dequeueTender(queueId, session.user.id, reason);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof EmDashError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    logger.error({ err, queueId }, 'DELETE queue failed');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
