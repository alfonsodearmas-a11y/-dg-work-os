import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUploadRole } from '@/lib/auth-helpers';
import { transaction } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

const gwiMetricsSchema = z.object({
  reportDate: z.string().min(1),
  nrwPercent: z.number(),
  waterProduced: z.number().optional(),
  waterBilled: z.number().optional(),
  activeDisruptions: z.number().optional(),
  disruptionAreas: z.string().optional(),
  avgResponseTime: z.number().optional(),
  avgRepairTime: z.number().optional(),
  customerComplaints: z.number().optional(),
  notes: z.string().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireUploadRole('gwi');
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const { data, error } = await parseBody(request, gwiMetricsSchema);
  if (error) return error;

  const { reportDate, nrwPercent, waterProduced, waterBilled, activeDisruptions, disruptionAreas, avgResponseTime, avgRepairTime, customerComplaints, notes } = data!;

  const result = await transaction(async (client) => {
    const existing = await client.query('SELECT id, status FROM gwi_daily_metrics WHERE report_date = $1', [reportDate]);
    let metricsResult, action: string;

    if (existing.rows.length > 0) {
      if (existing.rows[0].status === 'approved') throw new Error('Cannot modify approved metrics');
      metricsResult = await client.query(
        `UPDATE gwi_daily_metrics SET nrw_percent=$1, water_produced_cubic_meters=$2, water_billed_cubic_meters=$3, active_disruptions=$4, disruption_areas=$5, avg_response_time_hours=$6, avg_repair_time_hours=$7, customer_complaints=$8, notes=$9, submitted_by=$10, status='pending' WHERE report_date=$11 RETURNING *`,
        [nrwPercent, waterProduced, waterBilled, activeDisruptions || 0, disruptionAreas, avgResponseTime, avgRepairTime, customerComplaints || 0, notes, session.user.id, reportDate]
      );
      action = 'UPDATE';
    } else {
      metricsResult = await client.query(
        `INSERT INTO gwi_daily_metrics (report_date, nrw_percent, water_produced_cubic_meters, water_billed_cubic_meters, active_disruptions, disruption_areas, avg_response_time_hours, avg_repair_time_hours, customer_complaints, notes, submitted_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending') RETURNING *`,
        [reportDate, nrwPercent, waterProduced, waterBilled, activeDisruptions || 0, disruptionAreas, avgResponseTime, avgRepairTime, customerComplaints || 0, notes, session.user.id]
      );
      action = 'CREATE';
    }

    if (nrwPercent > 50) {
      await client.query(
        "INSERT INTO alerts (agency, severity, metric_name, current_value, threshold_value, message) VALUES ('gwi', 'critical', 'nrw_percent', $1, 50, $2)",
        [nrwPercent, `NRW at ${nrwPercent}% - exceeds 50% threshold`]
      );
    }

    return { metrics: metricsResult.rows[0], action };
  });

  await auditService.log({ userId: session.user.id, action: result.action, entityType: 'gwi_daily_metrics', entityId: result.metrics.id, newValues: data, request });
  return NextResponse.json({ success: true, message: `GWI metrics ${result.action.toLowerCase()}d successfully`, data: result.metrics }, { status: result.action === 'CREATE' ? 201 : 200 });
});
