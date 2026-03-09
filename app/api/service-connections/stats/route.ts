import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { computeEfficiencyMetrics } from '@/lib/service-connection-analysis';
import type { ServiceConnection } from '@/lib/service-connection-types';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const { data, error } = await supabaseAdmin
      .from('service_connections')
      .select('*')
      .not('status', 'eq', 'legacy_excluded')
      .not('is_legacy', 'eq', true)
      .order('application_date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch service connection stats' }, { status: 500 });
    }

    const metrics = computeEfficiencyMetrics((data || []) as ServiceConnection[]);
    return NextResponse.json(metrics);
  } catch (err) {
    logger.error({ err }, 'Service connections stats error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
