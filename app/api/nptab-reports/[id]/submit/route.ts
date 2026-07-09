import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { supabaseAdmin } from '@/lib/db-admin';
import { submitReport } from '@/lib/nptab/queries';
import { renderNptabReportPDF } from '@/lib/pdf/nptab-report-render';
import { NPTAB_DELIVERY_METHODS, type NptabDeliveryMethod } from '@/lib/nptab/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['superadmin']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const deliveryMethod = body.delivery_method;
  const deliveredTo = body.delivered_to;
  if (typeof deliveryMethod !== 'string' || !(NPTAB_DELIVERY_METHODS as readonly string[]).includes(deliveryMethod)) {
    return NextResponse.json({ error: 'Invalid delivery_method' }, { status: 400 });
  }
  if (typeof deliveredTo !== 'string' || !deliveredTo.trim()) {
    return NextResponse.json({ error: 'delivered_to is required' }, { status: 400 });
  }

  try {
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('name, formal_title')
      .eq('id', session.user.id)
      .single();
    const referrerName = userRow?.name ?? 'Director General';
    const referrerTitle =
      userRow?.formal_title ?? 'Director General, Ministry of Public Utilities and Aviation';

    const updated = await submitReport(
      id,
      deliveryMethod as NptabDeliveryMethod,
      deliveredTo,
      session.user.id,
      async (report, tenders) => renderNptabReportPDF({ report, tenders, referrerName, referrerTitle }),
    );
    return NextResponse.json({ report: updated, pdfUrl: `/api/nptab-reports/${id}/pdf` });
  } catch (err) {
    logger.error({ err, id }, 'POST /api/nptab-reports/[id]/submit failed');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
