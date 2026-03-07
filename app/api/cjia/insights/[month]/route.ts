import { NextResponse, type NextRequest } from 'next/server';
import { getCJIAInsightsForMonth } from '@/lib/cjia-insights';
import { requireRole } from '@/lib/auth-helpers';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { month } = await params;

  try {
    const normalizedMonth = month.length === 7 ? `${month}-01` : month;
    const insights = await getCJIAInsightsForMonth(normalizedMonth);

    if (!insights) {
      return NextResponse.json({ success: true, data: null, hasInsights: false });
    }

    return NextResponse.json({ success: true, data: insights, hasInsights: true });
  } catch (err: unknown) {
    console.error('[cjia/insights] Error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
