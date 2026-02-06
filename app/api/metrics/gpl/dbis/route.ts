import { NextRequest, NextResponse } from 'next/server';
import { transaction } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      reportDate, stationData, hampshireSolarMwp, prospectSolarMwp, trafalgarSolarMwp,
      eveningPeakOnbars, eveningPeakSuppressed, dayPeakOnbars, dayPeakSuppressed,
      generationAvailability, activeOutages, affectedCustomers, avgRestorationTime,
      collectionRate, hfoGeneration, lfoGeneration, solarGeneration, otherGeneration, notes,
    } = body;

    if (!reportDate) return NextResponse.json({ success: false, error: 'Report date is required' }, { status: 400 });
    if (!stationData || Object.keys(stationData).length === 0) {
      return NextResponse.json({ success: false, error: 'Station data is required' }, { status: 400 });
    }

    let totalFossilCapacity = 0;
    for (const data of Object.values(stationData) as any[]) {
      totalFossilCapacity += parseFloat(data.available_mw) || 0;
    }
    const totalRenewable = (parseFloat(hampshireSolarMwp) || 0) + (parseFloat(prospectSolarMwp) || 0) + (parseFloat(trafalgarSolarMwp) || 0);

    const result = await transaction(async (client) => {
      const existing = await client.query('SELECT id, status FROM gpl_dbis_daily WHERE report_date = $1', [reportDate]);
      let metricsResult, action: string;

      if (existing.rows.length > 0) {
        if (existing.rows[0].status === 'approved') throw new Error('Cannot modify approved metrics');
        metricsResult = await client.query(
          `UPDATE gpl_dbis_daily SET station_data=$1, hampshire_solar_mwp=$2, prospect_solar_mwp=$3, trafalgar_solar_mwp=$4, total_fossil_capacity_mw=$5, total_renewable_capacity_mw=$6, total_dbis_capacity_mw=$7, evening_peak_onbars_mw=$8, evening_peak_suppressed_mw=$9, day_peak_onbars_mw=$10, day_peak_suppressed_mw=$11, generation_availability_mw=$12, active_outages=$13, affected_customers=$14, avg_restoration_time_hours=$15, collection_rate_percent=$16, hfo_generation_percent=$17, lfo_generation_percent=$18, solar_generation_percent=$19, other_generation_percent=$20, notes=$21, submitted_by=$22, status='pending' WHERE report_date=$23 RETURNING *`,
          [JSON.stringify(stationData), hampshireSolarMwp || 0, prospectSolarMwp || 0, trafalgarSolarMwp || 0, totalFossilCapacity, totalRenewable, totalFossilCapacity + totalRenewable, eveningPeakOnbars, eveningPeakSuppressed, dayPeakOnbars, dayPeakSuppressed, generationAvailability, activeOutages || 0, affectedCustomers || 0, avgRestorationTime, collectionRate, hfoGeneration, lfoGeneration, solarGeneration, otherGeneration, notes, 'dg-admin', reportDate]
        );
        action = 'UPDATE';
      } else {
        metricsResult = await client.query(
          `INSERT INTO gpl_dbis_daily (report_date, station_data, hampshire_solar_mwp, prospect_solar_mwp, trafalgar_solar_mwp, total_fossil_capacity_mw, total_renewable_capacity_mw, total_dbis_capacity_mw, evening_peak_onbars_mw, evening_peak_suppressed_mw, day_peak_onbars_mw, day_peak_suppressed_mw, generation_availability_mw, active_outages, affected_customers, avg_restoration_time_hours, collection_rate_percent, hfo_generation_percent, lfo_generation_percent, solar_generation_percent, other_generation_percent, notes, submitted_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'pending') RETURNING *`,
          [reportDate, JSON.stringify(stationData), hampshireSolarMwp || 0, prospectSolarMwp || 0, trafalgarSolarMwp || 0, totalFossilCapacity, totalRenewable, totalFossilCapacity + totalRenewable, eveningPeakOnbars, eveningPeakSuppressed, dayPeakOnbars, dayPeakSuppressed, generationAvailability, activeOutages || 0, affectedCustomers || 0, avgRestorationTime, collectionRate, hfoGeneration, lfoGeneration, solarGeneration, otherGeneration, notes, 'dg-admin']
        );
        action = 'CREATE';
      }

      // Create alerts for low reserve margin
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

    await auditService.log({ userId: 'dg-admin', action: result.action, entityType: 'gpl_dbis_daily', entityId: result.metrics.id, newValues: body, request });
    return NextResponse.json({ success: true, message: `GPL DBIS metrics ${result.action.toLowerCase()}d successfully`, data: result.metrics }, { status: result.action === 'CREATE' ? 201 : 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to submit GPL DBIS metrics' }, { status: 400 });
  }
}
