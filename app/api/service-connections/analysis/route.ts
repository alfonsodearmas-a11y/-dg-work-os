import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeEfficiencyMetrics } from '@/lib/service-connection-analysis';
import type { ServiceConnection } from '@/lib/service-connection-types';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('service_connections')
      .select('*')
      .order('application_date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
    console.error('[service-connections/analysis] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
