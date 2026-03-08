import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { computeEfficiencyMetrics } from '@/lib/service-connection-analysis';
import type { ServiceConnection } from '@/lib/service-connection-types';
import { withErrorHandler } from '@/lib/api-utils';

export const POST = withErrorHandler(async () => {
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
  const metrics = computeEfficiencyMetrics(connections);

  let upserted = 0;
  for (const month of metrics.monthly) {
    const reportMonth = month.month + '-01';

    const trackACompleted = connections.filter(c =>
      c.status === 'completed' && c.track === 'A' && c.disappeared_date?.slice(0, 7) === month.month
    );
    const trackBCompleted = connections.filter(c =>
      c.status === 'completed' && c.track === 'B' && c.disappeared_date?.slice(0, 7) === month.month
    );
    const designCompleted = connections.filter(c =>
      c.status === 'completed' && c.track === 'Design' && c.disappeared_date?.slice(0, 7) === month.month
    );

    const { error: upsertError } = await supabaseAdmin
      .from('service_connection_monthly_stats')
      .upsert({
        report_month: reportMonth,
        opened_count: month.opened,
        completed_count: month.completed,
        queue_depth: month.queueDepth,
        avg_days_to_complete: month.avgDaysToComplete,
        pct_within_sla: month.trackBSla,
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
        design_completed: designCompleted.length,
        design_avg_days: designCompleted.length > 0
          ? Math.round(designCompleted.reduce((a, c) => a + (c.total_days_to_complete || 0), 0) / designCompleted.length)
          : null,
        design_sla_pct: month.designSla,
      }, { onConflict: 'report_month' });

    if (!upsertError) upserted++;
  }

  return NextResponse.json({ success: true, monthsProcessed: upserted });
});
