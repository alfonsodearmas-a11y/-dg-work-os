import { NextRequest, NextResponse } from 'next/server';
import { transaction } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportDate, currentLoad, capacity, activeOutages, affectedCustomers, avgRestorationTime, collectionRate, hfoGeneration, lfoGeneration, solarGeneration, otherGeneration, notes } = body;

    if (!reportDate) return NextResponse.json({ success: false, error: 'Report date is required' }, { status: 400 });
    if (currentLoad === undefined) return NextResponse.json({ success: false, error: 'Current load is required' }, { status: 400 });

    const totalGeneration = (hfoGeneration || 0) + (lfoGeneration || 0) + (solarGeneration || 0) + (otherGeneration || 0);
    if (Math.abs(totalGeneration - 100) > 0.1) {
      return NextResponse.json({ success: false, error: 'Generation percentages must sum to 100%' }, { status: 400 });
    }

    const result = await transaction(async (client) => {
      const existing = await client.query('SELECT id, status FROM gpl_daily_metrics WHERE report_date = $1', [reportDate]);
      let metricsResult, action: string;

      if (existing.rows.length > 0) {
        if (existing.rows[0].status === 'approved') throw new Error('Cannot modify approved metrics');
        metricsResult = await client.query(
          `UPDATE gpl_daily_metrics SET current_load_mw=$1, capacity_mw=$2, active_outages=$3, affected_customers=$4, avg_restoration_time_hours=$5, collection_rate_percent=$6, hfo_generation_percent=$7, lfo_generation_percent=$8, solar_generation_percent=$9, other_generation_percent=$10, notes=$11, submitted_by=$12, status='pending' WHERE report_date=$13 RETURNING *`,
          [currentLoad, capacity, activeOutages || 0, affectedCustomers || 0, avgRestorationTime, collectionRate, hfoGeneration, lfoGeneration, solarGeneration, otherGeneration, notes, 'dg-admin', reportDate]
        );
        action = 'UPDATE';
      } else {
        metricsResult = await client.query(
          `INSERT INTO gpl_daily_metrics (report_date, current_load_mw, capacity_mw, active_outages, affected_customers, avg_restoration_time_hours, collection_rate_percent, hfo_generation_percent, lfo_generation_percent, solar_generation_percent, other_generation_percent, notes, submitted_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending') RETURNING *`,
          [reportDate, currentLoad, capacity, activeOutages || 0, affectedCustomers || 0, avgRestorationTime, collectionRate, hfoGeneration, lfoGeneration, solarGeneration, otherGeneration, notes, 'dg-admin']
        );
        action = 'CREATE';
      }
      return { metrics: metricsResult.rows[0], action };
    });

    await auditService.log({ userId: 'dg-admin', action: result.action, entityType: 'gpl_daily_metrics', entityId: result.metrics.id, newValues: body, request });
    return NextResponse.json({ success: true, message: `GPL metrics ${result.action.toLowerCase()}d successfully`, data: result.metrics }, { status: result.action === 'CREATE' ? 201 : 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to submit GPL metrics' }, { status: 400 });
  }
}
