import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { supabaseAdmin } from '@/lib/db-admin';
import { getReportById, getReportTenderSnapshots } from '@/lib/nptab/queries';
import { renderNptabReportPDF } from '@/lib/pdf/nptab-report-render';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['superadmin']);
  if (auth instanceof NextResponse) return auth;

  try {
    const report = await getReportById(id);
    if (!report) return new NextResponse('Not found', { status: 404 });
    const tenders = await getReportTenderSnapshots(id);
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('name, formal_title')
      .eq('id', report.generated_by)
      .single();
    const referrerName = userRow?.name ?? 'Director General';
    const referrerTitle =
      userRow?.formal_title ?? 'Director General, Ministry of Public Utilities and Aviation';
    const pdfBuffer = await renderNptabReportPDF({ report, tenders, referrerName, referrerTitle });
    const filename = `${report.reference_number ?? 'draft'}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    logger.error({ err, id }, 'GET /api/nptab-reports/[id]/pdf failed');
    return new NextResponse('PDF generation failed', { status: 500 });
  }
}
