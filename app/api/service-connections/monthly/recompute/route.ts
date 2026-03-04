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

export async function POST() {
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

    // Upsert monthly stats
    let upserted = 0;
    for (const month of metrics.monthly) {
      const reportMonth = month.month + '-01'; // First day of month

      const trackACompleted = connections.filter(c =>
        c.status === 'completed' && c.track === 'A' && c.disappeared_date?.slice(0, 7) === month.month
      );
      const trackBCompleted = connections.filter(c =>
        c.status === 'completed' && c.track === 'B' && c.disappeared_date?.slice(0, 7) === month.month
      );

      const { error: upsertError } = await supabase
        .from('service_connection_monthly_stats')
        .upsert({
          report_month: reportMonth,
          opened_count: month.opened,
          completed_count: month.completed,
          queue_depth: month.queueDepth,
          avg_days_to_complete: month.avgDaysToComplete,
          pct_within_sla: month.trackBSla, // Use Track B SLA as primary
          track_a_completed: trackACompleted.length,
          track_a_avg_days: trackACompleted.length > 0
            ? Math.round(trackACompleted.reduce((a, c) => a + (c.total_days_to_complete || 0), 0) / trackACompleted.length)
            : null,
          track_a_sla_pct: month.trackASla,
          track_b_completed: trackBCompleted.length,
          track_b_avg_days: trackBCompleted.length > 0
            ? Math.round(trackBCompleted.reduce((a, c) => a + (c.total_days_to_complete || 0), 0) / trackBCompleted.length)
            : null,
          track_b_sla_pct: month.trackBSla,
        }, { onConflict: 'report_month' });

      if (!upsertError) upserted++;
    }

    return NextResponse.json({ success: true, monthsProcessed: upserted });
  } catch (err) {
    console.error('[service-connections/monthly/recompute] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
