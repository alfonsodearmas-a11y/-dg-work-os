import { NextRequest, NextResponse } from 'next/server';
import { transaction } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportDate, nrwPercent, waterProduced, waterBilled, activeDisruptions, disruptionAreas, avgResponseTime, avgRepairTime, customerComplaints, notes } = body;

    if (!reportDate) return NextResponse.json({ success: false, error: 'Report date is required' }, { status: 400 });
    if (nrwPercent === undefined) return NextResponse.json({ success: false, error: 'NRW percent is required' }, { status: 400 });

    const result = await transaction(async (client) => {
      const existing = await client.query('SELECT id, status FROM gwi_daily_metrics WHERE report_date = $1', [reportDate]);
      let metricsResult, action: string;

      if (existing.rows.length > 0) {
        if (existing.rows[0].status === 'approved') throw new Error('Cannot modify approved metrics');
        metricsResult = await client.query(
          `UPDATE gwi_daily_metrics SET nrw_percent=$1, water_produced_cubic_meters=$2, water_billed_cubic_meters=$3, active_disruptions=$4, disruption_areas=$5, avg_response_time_hours=$6, avg_repair_time_hours=$7, customer_complaints=$8, notes=$9, submitted_by=$10, status='pending' WHERE report_date=$11 RETURNING *`,
          [nrwPercent, waterProduced, waterBilled, activeDisruptions || 0, disruptionAreas, avgResponseTime, avgRepairTime, customerComplaints || 0, notes, 'dg-admin', reportDate]
        );
        action = 'UPDATE';
      } else {
        metricsResult = await client.query(
          `INSERT INTO gwi_daily_metrics (report_date, nrw_percent, water_produced_cubic_meters, water_billed_cubic_meters, active_disruptions, disruption_areas, avg_response_time_hours, avg_repair_time_hours, customer_complaints, notes, submitted_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending') RETURNING *`,
          [reportDate, nrwPercent, waterProduced, waterBilled, activeDisruptions || 0, disruptionAreas, avgResponseTime, avgRepairTime, customerComplaints || 0, notes, 'dg-admin']
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

    await auditService.log({ userId: 'dg-admin', action: result.action, entityType: 'gwi_daily_metrics', entityId: result.metrics.id, newValues: body, request });
    return NextResponse.json({ success: true, message: `GWI metrics ${result.action.toLowerCase()}d successfully`, data: result.metrics }, { status: result.action === 'CREATE' ? 201 : 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to submit GWI metrics' }, { status: 400 });
  }
}
