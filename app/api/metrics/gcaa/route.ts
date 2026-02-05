import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth';
import { transaction } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json();
    const { reportDate, activeRegistrations, inspectionsMtd, inspectionsTarget, complianceRate, incidentReports, incidentDetails, renewalsPending, notes } = body;

    if (!reportDate) return NextResponse.json({ success: false, error: 'Report date is required' }, { status: 400 });
    if (activeRegistrations === undefined) return NextResponse.json({ success: false, error: 'Active registrations required' }, { status: 400 });

    const result = await transaction(async (client) => {
      const existing = await client.query('SELECT id, status FROM gcaa_daily_metrics WHERE report_date = $1', [reportDate]);
      let metricsResult, action: string;

      if (existing.rows.length > 0) {
        if (existing.rows[0].status === 'approved') throw new Error('Cannot modify approved metrics');
        metricsResult = await client.query(
          `UPDATE gcaa_daily_metrics SET active_aircraft_registrations=$1, inspections_completed_mtd=$2, inspections_target=$3, compliance_rate_percent=$4, incident_reports=$5, incident_details=$6, renewals_pending=$7, notes=$8, submitted_by=$9, status='pending' WHERE report_date=$10 RETURNING *`,
          [activeRegistrations, inspectionsMtd, inspectionsTarget, complianceRate, incidentReports || 0, incidentDetails, renewalsPending || 0, notes, user.id, reportDate]
        );
        action = 'UPDATE';
      } else {
        metricsResult = await client.query(
          `INSERT INTO gcaa_daily_metrics (report_date, active_aircraft_registrations, inspections_completed_mtd, inspections_target, compliance_rate_percent, incident_reports, incident_details, renewals_pending, notes, submitted_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending') RETURNING *`,
          [reportDate, activeRegistrations, inspectionsMtd, inspectionsTarget, complianceRate, incidentReports || 0, incidentDetails, renewalsPending || 0, notes, user.id]
        );
        action = 'CREATE';
      }
      return { metrics: metricsResult.rows[0], action };
    });

    await auditService.log({ userId: user.id, action: result.action, entityType: 'gcaa_daily_metrics', entityId: result.metrics.id, newValues: body, request });
    return NextResponse.json({ success: true, message: `GCAA metrics ${result.action.toLowerCase()}d successfully`, data: result.metrics }, { status: result.action === 'CREATE' ? 201 : 200 });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message || 'Failed to submit GCAA metrics' }, { status: 400 });
  }
}
