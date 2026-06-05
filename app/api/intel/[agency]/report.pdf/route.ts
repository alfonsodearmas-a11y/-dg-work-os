import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { isIntelAgency } from '@/lib/agencies';
import { logger } from '@/lib/logger';
import { prepareReport, type ReportTemplate } from '@/lib/intel/prepare-report';

// Direct PDF download. Auth-gated by canAccessAgency. No rate limit
// (read-only). The PDF buffer is rendered fresh on each request.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agency: string }> },
) {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { agency } = await params;
  const lower = agency.toLowerCase();
  if (!isIntelAgency(lower)) {
    return NextResponse.json({ error: 'Unknown agency' }, { status: 404 });
  }
  if (!canAccessAgency(session.user.role, session.user.agency, lower)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const template: ReportTemplate =
    request.nextUrl.searchParams.get('template') === 'editorial' ? 'editorial' : 'plain';

  let prepared;
  try {
    prepared = await prepareReport({
      agency: lower,
      template,
      coverMessage: null,
      senderName: session.user.name || session.user.email,
      senderEmail: session.user.email ?? null,
    });
  } catch (err) {
    logger.error({ err, agency: lower, template }, 'report.pdf: prepareReport failed');
    return NextResponse.json({ error: 'Failed to render report' }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(prepared.pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${prepared.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
