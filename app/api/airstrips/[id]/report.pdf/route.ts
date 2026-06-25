import { NextRequest, NextResponse } from 'next/server';
import { requireAirstripAccess } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { prepareAirstripReport } from '@/lib/airstrips/report/prepare-airstrip-report';
import { renderAirstripReportPDF } from '@/lib/pdf/airstrip-report-render';

// Per-airstrip maintenance report. Auth-gated by requireAirstripAccess; rendered
// fresh per request (read-only). Photos are embedded as bytes by the data layer —
// no URL layer (bucket is private).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAirstripAccess();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');

  let data;
  try {
    data = await prepareAirstripReport(id, from, to);
  } catch (err) {
    logger.error({ err, id }, 'airstrip report.pdf: prepare failed');
    return NextResponse.json({ error: 'Failed to build report' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Airstrip not found' }, { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await renderAirstripReportPDF(data);
  } catch (err) {
    logger.error({ err, id }, 'airstrip report.pdf: render failed');
    return NextResponse.json({ error: 'Failed to render report' }, { status: 500 });
  }

  const safeName = data.airstrip.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="airstrip-${safeName}-report.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
