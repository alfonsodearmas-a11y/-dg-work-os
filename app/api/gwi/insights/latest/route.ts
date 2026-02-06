import { NextResponse } from 'next/server';
import { getLatestGWIInsights } from '@/lib/gwi-insights';

export async function GET() {
  try {
    const insights = await getLatestGWIInsights();

    if (!insights) {
      return NextResponse.json({ success: true, data: null, hasInsights: false });
    }

    return NextResponse.json({ success: true, data: insights, hasInsights: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
