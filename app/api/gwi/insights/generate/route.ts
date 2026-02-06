import { NextResponse, type NextRequest } from 'next/server';
import { generateGWIInsights } from '@/lib/gwi-insights';

export async function POST(request: NextRequest) {
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
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
