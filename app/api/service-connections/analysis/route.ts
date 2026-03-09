import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { computeEfficiencyMetrics } from '@/lib/service-connection-analysis';
import type { ServiceConnection } from '@/lib/service-connection-types';
import { logger } from '@/lib/logger';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { data, error } = await supabaseAdmin
      .from('service_connections')
      .select('*')
      .order('application_date', { ascending: false });

    if (error) {
      logger.error({ err: error }, 'Service connection analysis DB query failed');
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }

    const connections = (data || []) as ServiceConnection[];
    const metrics = computeEfficiencyMetrics(connections);

    // Compute additional analysis details
    const openOrders = connections.filter(c => c.status === 'open' && !c.is_legacy);
    const longestWaiting = openOrders
      .sort((a, b) => {
        const aDays = a.application_date
          ? Math.round((Date.now() - new Date(a.application_date + 'T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        const bDays = b.application_date
          ? Math.round((Date.now() - new Date(b.application_date + 'T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        return bDays - aDays;
      })
      .slice(0, 10);

    return NextResponse.json({
      metrics,
      longestWaiting: longestWaiting.map(c => ({
        id: c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
        customerRef: c.customer_reference,
        stage: c.current_stage,
        region: c.region,
        applicationDate: c.application_date,
        daysWaiting: c.application_date
          ? Math.round((Date.now() - new Date(c.application_date + 'T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24))
          : null,
      })),
    });
  } catch (err) {
    logger.error({ err }, 'Service connection analysis failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
