import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { transaction } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

const dbisSchema = z.object({
  reportDate: z.string().min(1),
  stationData: z.record(z.string(), z.any()).refine((v) => Object.keys(v).length > 0, { message: 'Station data must not be empty' }),
  hampshireSolarMwp: z.number().optional(),
  prospectSolarMwp: z.number().optional(),
  trafalgarSolarMwp: z.number().optional(),
  eveningPeakOnbars: z.number().optional(),
  eveningPeakSuppressed: z.number().optional(),
  dayPeakOnbars: z.number().optional(),
  dayPeakSuppressed: z.number().optional(),
  generationAvailability: z.number().optional(),
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

  const { data, error } = await parseBody(request, dbisSchema);
  if (error) return error;

  const {
    reportDate, stationData, hampshireSolarMwp, prospectSolarMwp, trafalgarSolarMwp,
    eveningPeakOnbars, eveningPeakSuppressed, dayPeakOnbars, dayPeakSuppressed,
    generationAvailability, activeOutages, affectedCustomers, avgRestorationTime,
    collectionRate, hfoGeneration, lfoGeneration, solarGeneration, otherGeneration, notes,
  } = data!;

  let totalFossilCapacity = 0;
  for (const d of Object.values(stationData) as any[]) {
    totalFossilCapacity += parseFloat(d.available_mw) || 0;
  }
  const totalRenewable = (parseFloat(String(hampshireSolarMwp)) || 0) + (parseFloat(String(prospectSolarMwp)) || 0) + (parseFloat(String(trafalgarSolarMwp)) || 0);

  const result = await transaction(async (client) => {
    const existing = await client.query('SELECT id, status FROM gpl_dbis_daily WHERE report_date = $1', [reportDate]);
    let metricsResult, action: string;

    if (existing.rows.length > 0) {
      if (existing.rows[0].status === 'approved') throw new Error('Cannot modify approved metrics');
      metricsResult = await client.query(
        `UPDATE gpl_dbis_daily SET station_data=$1, hampshire_solar_mwp=$2, prospect_solar_mwp=$3, trafalgar_solar_mwp=$4, total_fossil_capacity_mw=$5, total_renewable_capacity_mw=$6, total_dbis_capacity_mw=$7, evening_peak_onbars_mw=$8, evening_peak_suppressed_mw=$9, day_peak_onbars_mw=$10, day_peak_suppressed_mw=$11, generation_availability_mw=$12, active_outages=$13, affected_customers=$14, avg_restoration_time_hours=$15, collection_rate_percent=$16, hfo_generation_percent=$17, lfo_generation_percent=$18, solar_generation_percent=$19, other_generation_percent=$20, notes=$21, submitted_by=$22, status='pending' WHERE report_date=$23 RETURNING *`,
        [JSON.stringify(stationData), hampshireSolarMwp || 0, prospectSolarMwp || 0, trafalgarSolarMwp || 0, totalFossilCapacity, totalRenewable, totalFossilCapacity + totalRenewable, eveningPeakOnbars, eveningPeakSuppressed, dayPeakOnbars, dayPeakSuppressed, generationAvailability, activeOutages || 0, affectedCustomers || 0, avgRestorationTime, collectionRate, hfoGeneration, lfoGeneration, solarGeneration, otherGeneration, notes, session.user.id, reportDate]
      );
      action = 'UPDATE';
    } else {
      metricsResult = await client.query(
        `INSERT INTO gpl_dbis_daily (report_date, station_data, hampshire_solar_mwp, prospect_solar_mwp, trafalgar_solar_mwp, total_fossil_capacity_mw, total_renewable_capacity_mw, total_dbis_capacity_mw, evening_peak_onbars_mw, evening_peak_suppressed_mw, day_peak_onbars_mw, day_peak_suppressed_mw, generation_availability_mw, active_outages, affected_customers, avg_restoration_time_hours, collection_rate_percent, hfo_generation_percent, lfo_generation_percent, solar_generation_percent, other_generation_percent, notes, submitted_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'pending') RETURNING *`,
        [reportDate, JSON.stringify(stationData), hampshireSolarMwp || 0, prospectSolarMwp || 0, trafalgarSolarMwp || 0, totalFossilCapacity, totalRenewable, totalFossilCapacity + totalRenewable, eveningPeakOnbars, eveningPeakSuppressed, dayPeakOnbars, dayPeakSuppressed, generationAvailability, activeOutages || 0, affectedCustomers || 0, avgRestorationTime, collectionRate, hfoGeneration, lfoGeneration, solarGeneration, otherGeneration, notes, session.user.id]
      );
      action = 'CREATE';
    }

    const peakDemand = eveningPeakOnbars || dayPeakOnbars || 0;
    if (peakDemand > 0 && generationAvailability) {
      const reserveMargin = ((generationAvailability - peakDemand) / peakDemand) * 100;
      if (reserveMargin < 15) {
        await client.query(
          "INSERT INTO alerts (agency, severity, metric_name, current_value, threshold_value, message) VALUES ('gpl', $1, 'reserve_margin', $2, 15, $3)",
          [reserveMargin < 10 ? 'critical' : 'warning', reserveMargin, `Reserve margin at ${reserveMargin.toFixed(1)}% - below 15% threshold`]
        );
      }
    }

    return { metrics: metricsResult.rows[0], action };
  });

  await auditService.log({ userId: session.user.id, action: result.action, entityType: 'gpl_dbis_daily', entityId: result.metrics.id, newValues: data, request });
  return NextResponse.json({ success: true, message: `GPL DBIS metrics ${result.action.toLowerCase()}d successfully`, data: result.metrics }, { status: result.action === 'CREATE' ? 201 : 200 });
});
