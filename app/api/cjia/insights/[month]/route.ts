import { NextResponse, type NextRequest } from 'next/server';
import { getCJIAInsightsForMonth } from '@/lib/cjia-insights';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params;

  try {
    const normalizedMonth = month.length === 7 ? `${month}-01` : month;
    const insights = await getCJIAInsightsForMonth(normalizedMonth);

    if (!insights) {
      return NextResponse.json({ success: true, data: null, hasInsights: false });
    }

    return NextResponse.json({ success: true, data: insights, hasInsights: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
