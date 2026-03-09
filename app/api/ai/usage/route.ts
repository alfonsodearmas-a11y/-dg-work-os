import { NextRequest, NextResponse } from 'next/server';
import { getUsageStats } from '@/lib/ai/token-budget';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

// ── GET /api/ai/usage ───────────────────────────────────────────────────────
// Admin endpoint for AI usage statistics.

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const url = new URL(request.url);
    const days = Math.min(30, Math.max(1, parseInt(url.searchParams.get('days') || '7', 10)));

    const stats = await getUsageStats(days);

    return NextResponse.json(stats);
  } catch (err: any) {
    logger.error({ err }, 'AI usage stats fetch failed');
    return NextResponse.json({ error: 'Failed to fetch usage stats' }, { status: 500 });
  }
}
