import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import {
  closeReport,
  getReportAuditLog,
  getReportById,
  getReportTenderSnapshots,
  updateReportNarrative,
} from '@/lib/nptab/queries';
import { EmDashError } from '@/lib/referrals/em-dash-guard';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['dg', 'ps']);
  if (auth instanceof NextResponse) return auth;
  const report = await getReportById(id);
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [tenders, audit] = await Promise.all([
    getReportTenderSnapshots(id),
    getReportAuditLog(id),
  ]);
  return NextResponse.json({ report, tenders, audit });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    if (typeof body.narrative === 'string') {
      const updated = await updateReportNarrative(id, body.narrative, session.user.id);
      return NextResponse.json({ report: updated });
    }
    if (typeof body.closure_reason === 'string') {
      const updated = await closeReport(id, body.closure_reason, session.user.id);
      return NextResponse.json({ report: updated });
    }
    return NextResponse.json({ error: 'No valid field to update' }, { status: 400 });
  } catch (err) {
    if (err instanceof EmDashError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    logger.error({ err, id }, 'PATCH /api/nptab-reports/[id] failed');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
