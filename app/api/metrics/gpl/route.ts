import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, canUploadData } from '@/lib/auth-helpers';
import { transaction } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';

const gplMetricsSchema = z.object({
  reportDate: z.string().min(1),
  currentLoad: z.number(),
  capacity: z.number().optional(),
  activeOutages: z.number().optional(),
  affectedCustomers: z.number().optional(),
  avgRestorationTime: z.number().optional(),
  collectionRate: z.number().optional(),
  hfoGeneration: z.number().optional(),
  lfoGeneration: z.number().optional(),
  solarGeneration: z.number().optional(),
  otherGeneration: z.number().optional(),
  notes: z.string().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireRole(['dg', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  if (!canUploadData(session.user.role, session.user.agency, 'gpl')) {
    return NextResponse.json({ error: 'Not authorized to upload GPL data' }, { status: 403 });
  }

  const { data, error } = await parseBody(request, gplMetricsSchema);
  if (error) return error;

  const { reportDate, currentLoad, capacity, activeOutages, affectedCustomers, avgRestorationTime, collectionRate, hfoGeneration, lfoGeneration, solarGeneration, otherGeneration, notes } = data!;

  const totalGeneration = (hfoGeneration || 0) + (lfoGeneration || 0) + (solarGeneration || 0) + (otherGeneration || 0);
  if (Math.abs(totalGeneration - 100) > 0.1) {
    return apiError('VALIDATION_ERROR', 'Generation percentages must sum to 100%', 400);
  }

  const result = await transaction(async (client) => {
    const existing = await client.query('SELECT id, status FROM gpl_daily_metrics WHERE report_date = $1', [reportDate]);
    let metricsResult, action: string;

    if (existing.rows.length > 0) {
      if (existing.rows[0].status === 'approved') throw new Error('Cannot modify approved metrics');
      metricsResult = await client.query(
        `UPDATE gpl_daily_metrics SET current_load_mw=$1, capacity_mw=$2, active_outages=$3, affected_customers=$4, avg_restoration_time_hours=$5, collection_rate_percent=$6, hfo_generation_percent=$7, lfo_generation_percent=$8, solar_generation_percent=$9, other_generation_percent=$10, notes=$11, submitted_by=$12, status='pending' WHERE report_date=$13 RETURNING *`,
        [currentLoad, capacity, activeOutages || 0, affectedCustomers || 0, avgRestorationTime, collectionRate, hfoGeneration, lfoGeneration, solarGeneration, otherGeneration, notes, session.user.id, reportDate]
      );
      action = 'UPDATE';
    } else {
      metricsResult = await client.query(
        `INSERT INTO gpl_daily_metrics (report_date, current_load_mw, capacity_mw, active_outages, affected_customers, avg_restoration_time_hours, collection_rate_percent, hfo_generation_percent, lfo_generation_percent, solar_generation_percent, other_generation_percent, notes, submitted_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending') RETURNING *`,
        [reportDate, currentLoad, capacity, activeOutages || 0, affectedCustomers || 0, avgRestorationTime, collectionRate, hfoGeneration, lfoGeneration, solarGeneration, otherGeneration, notes, session.user.id]
      );
      action = 'CREATE';
    }
    return { metrics: metricsResult.rows[0], action };
  });

  await auditService.log({ userId: session.user.id, action: result.action, entityType: 'gpl_daily_metrics', entityId: result.metrics.id, newValues: data, request });
  return NextResponse.json({ success: true, message: `GPL metrics ${result.action.toLowerCase()}d successfully`, data: result.metrics }, { status: result.action === 'CREATE' ? 201 : 200 });
});
