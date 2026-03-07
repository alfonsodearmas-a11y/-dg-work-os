import { NextResponse } from 'next/server';
import { getLatestGWIInsights } from '@/lib/gwi-insights';
import { requireRole } from '@/lib/auth-helpers';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const insights = await getLatestGWIInsights();

    if (!insights) {
      return NextResponse.json({ success: true, data: null, hasInsights: false });
    }

    return NextResponse.json({ success: true, data: insights, hasInsights: true });
  } catch (err: unknown) {
    console.error('[gwi/insights/latest] Error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
