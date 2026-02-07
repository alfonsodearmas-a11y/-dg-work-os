import { NextRequest, NextResponse } from 'next/server';
import { getUsageStats } from '@/lib/ai/token-budget';

// ── GET /api/ai/usage ───────────────────────────────────────────────────────
// Admin endpoint for AI usage statistics.

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const days = Math.min(30, Math.max(1, parseInt(url.searchParams.get('days') || '7', 10)));

    const stats = await getUsageStats(days);

    return NextResponse.json(stats);
  } catch (err: any) {
    console.error('[ai/usage] Error:', err.message);
    return NextResponse.json({ error: 'Failed to fetch usage stats' }, { status: 500 });
  }
}
