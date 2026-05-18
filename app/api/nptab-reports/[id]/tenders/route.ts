import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { addTenderToReport, removeTenderFromReport } from '@/lib/nptab/queries';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  let body: { tender_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.tender_id !== 'string' || !body.tender_id) {
    return NextResponse.json({ error: 'tender_id is required' }, { status: 400 });
  }
  try {
    await addTenderToReport(id, body.tender_id, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err, id, tenderId: body.tender_id }, 'POST add tender failed');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  const tenderId = request.nextUrl.searchParams.get('tender_id');
  if (!tenderId) {
    return NextResponse.json({ error: 'tender_id query param required' }, { status: 400 });
  }
  try {
    await removeTenderFromReport(id, tenderId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err, id, tenderId }, 'DELETE tender failed');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
