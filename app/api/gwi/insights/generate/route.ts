import { NextResponse, type NextRequest } from 'next/server';
import { generateGWIInsights } from '@/lib/gwi-insights';
import { requireRole } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await request.json();
    const { month, forceRegenerate } = body;

    if (!month) {
      return NextResponse.json({ success: false, error: 'month is required (YYYY-MM or YYYY-MM-DD)' }, { status: 400 });
    }

    const normalizedMonth = month.length === 7 ? `${month}-01` : month;
    const insights = await generateGWIInsights(normalizedMonth, forceRegenerate ?? false);

    if (!insights) {
      return NextResponse.json({ success: false, error: 'Failed to generate insights. Check API key and data availability.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: insights });
  } catch (err: unknown) {
    console.error('[gwi/insights/generate] Error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
