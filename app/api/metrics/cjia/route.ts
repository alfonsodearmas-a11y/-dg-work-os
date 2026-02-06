import { NextRequest, NextResponse } from 'next/server';
import { transaction } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportDate, arrivals, departures, onTimePercent, revenueMtd, revenueTarget, safetyIncidents, safetyIncidentDetails, powerUptime, baggageUptime, securityUptime, notes } = body;

    if (!reportDate) return NextResponse.json({ success: false, error: 'Report date is required' }, { status: 400 });
    if (arrivals === undefined) return NextResponse.json({ success: false, error: 'Arrivals is required' }, { status: 400 });

    const result = await transaction(async (client) => {
      const existing = await client.query('SELECT id, status FROM cjia_daily_metrics WHERE report_date = $1', [reportDate]);
      let metricsResult, action: string;

      if (existing.rows.length > 0) {
        if (existing.rows[0].status === 'approved') throw new Error('Cannot modify approved metrics');
        metricsResult = await client.query(
          `UPDATE cjia_daily_metrics SET arrivals=$1, departures=$2, on_time_departure_percent=$3, revenue_mtd=$4, revenue_target=$5, safety_incidents=$6, safety_incident_details=$7, power_uptime_percent=$8, baggage_uptime_percent=$9, security_uptime_percent=$10, notes=$11, submitted_by=$12, status='pending' WHERE report_date=$13 RETURNING *`,
          [arrivals, departures, onTimePercent, revenueMtd, revenueTarget, safetyIncidents || 0, safetyIncidentDetails, powerUptime, baggageUptime, securityUptime, notes, 'dg-admin', reportDate]
        );
        action = 'UPDATE';
      } else {
        metricsResult = await client.query(
          `INSERT INTO cjia_daily_metrics (report_date, arrivals, departures, on_time_departure_percent, revenue_mtd, revenue_target, safety_incidents, safety_incident_details, power_uptime_percent, baggage_uptime_percent, security_uptime_percent, notes, submitted_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending') RETURNING *`,
          [reportDate, arrivals, departures, onTimePercent, revenueMtd, revenueTarget, safetyIncidents || 0, safetyIncidentDetails, powerUptime, baggageUptime, securityUptime, notes, 'dg-admin']
        );
        action = 'CREATE';
      }

      if ((safetyIncidents || 0) > 0) {
        await client.query(
          "INSERT INTO alerts (agency, severity, metric_name, current_value, message) VALUES ('cjia', 'critical', 'safety_incidents', $1, $2)",
          [safetyIncidents, `${safetyIncidents} safety incident(s) reported for ${reportDate}`]
        );
      }

      return { metrics: metricsResult.rows[0], action };
    });

    await auditService.log({ userId: 'dg-admin', action: result.action, entityType: 'cjia_daily_metrics', entityId: result.metrics.id, newValues: body, request });
    return NextResponse.json({ success: true, message: `CJIA metrics ${result.action.toLowerCase()}d successfully`, data: result.metrics }, { status: result.action === 'CREATE' ? 201 : 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to submit CJIA metrics' }, { status: 400 });
  }
}
