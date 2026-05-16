import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { getReferralById } from '@/lib/referrals/queries';
import { renderReferralPDF } from '@/lib/pdf/referral-render';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['dg', 'ps', 'minister']);
  if (auth instanceof NextResponse) return auth;

  try {
    const referral = await getReferralById(id);
    if (!referral) return new NextResponse('Not found', { status: 404 });

    // Minister can never see a draft.
    if (auth.session.user.role === 'minister' && referral.status === 'drafted') {
      return new NextResponse('Not found', { status: 404 });
    }

    const referrerName = referral.referrer_name ?? 'Director General';
    const referrerTitle =
      referral.referrer_title ?? 'Director General, Ministry of Public Utilities and Aviation';

    const pdfBuffer = await renderReferralPDF({ referral, referrerName, referrerTitle });
    const filename = `${referral.reference_number ?? 'draft'}.pdf`;

    // Buffer is not directly assignable to BodyInit; wrap as Uint8Array.
    const body = new Uint8Array(pdfBuffer);
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    logger.error({ err, id }, 'GET /api/referrals/[id]/pdf failed');
    return new NextResponse('PDF generation failed', { status: 500 });
  }
}

