import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { computeEfficiencyMetrics } from '@/lib/service-connection-analysis';
import { generateEfficiencyAnalysis, getCachedAnalysis, saveAnalysis } from '@/lib/service-connection-ai';
import type { ServiceConnection } from '@/lib/service-connection-types';
import { withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;
    const cached = await getCachedAnalysis();
    if (cached) {
      return NextResponse.json({ analysis: cached, cached: true });
    }
    return NextResponse.json({ analysis: null, cached: false });
  } catch (err) {
    logger.error({ err }, 'Service connections deep analysis GET error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withErrorHandler(async (_request: NextRequest) => {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await supabaseAdmin
    .from('service_connections')
    .select('*')
    .order('application_date', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch service connections' }, { status: 500 });
  }

  const connections = (data || []) as ServiceConnection[];
  if (connections.length === 0) {
    return NextResponse.json({ error: 'No service connection data available' }, { status: 400 });
  }

  const metrics = computeEfficiencyMetrics(connections);
  const analysis = await generateEfficiencyAnalysis(metrics, connections);
  await saveAnalysis(analysis);

  return NextResponse.json({ analysis, cached: false });
});
