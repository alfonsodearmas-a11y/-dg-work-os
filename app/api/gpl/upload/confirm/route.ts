import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth';
import { transaction } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';
import { generateGPLBriefing } from '@/lib/ai-analysis';

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json();
    const { uploadData, reportDate } = body;

    if (!uploadData) {
      return NextResponse.json(
        { success: false, error: 'Upload data is required. Run the preview step first.' },
        { status: 400 }
      );
    }

    if (!reportDate) {
      return NextResponse.json(
        { success: false, error: 'Report date is required.' },
        { status: 400 }
      );
    }

    const result = await transaction(async (client) => {
      // Insert into gpl_uploads
      const uploadResult = await client.query(
        `INSERT INTO gpl_uploads (report_date, file_name, uploaded_by, status, raw_data)
         VALUES ($1, $2, $3, 'confirmed', $4)
         RETURNING id`,
        [
          reportDate,
          uploadData.fileName || 'gpl-dbis.xlsx',
          user.id,
          JSON.stringify(uploadData),
        ]
      );
      const uploadId = uploadResult.rows[0].id;

      // Extract summary data from the parsed upload
      const genStatus = uploadData.generationStatus;
      const schedule = uploadData.schedule;
      const summaries = genStatus?.summaries || {};
      const scheduleSummary = schedule?.summary || {};

      // Use schedule data (more detailed) when available, fall back to generation status
      const totalFossilCapacityMw = scheduleSummary.totalFossilFuelCapacityMw ?? summaries.totalFossilCapacity ?? null;
      const expectedPeakDemandMw = scheduleSummary.expectedPeakDemandMw ?? summaries.expectedPeakDemand ?? null;
      const reserveCapacityMw = scheduleSummary.reserveCapacityMw ?? summaries.reserveCapacity ?? null;
      const averageFor = scheduleSummary.averageFor ?? null;
      const hampshireSolarMwp = scheduleSummary.solarHampshireMwp ?? summaries.hampshireSolarMwp ?? 0;
      const prospectSolarMwp = scheduleSummary.solarProspectMwp ?? summaries.prospectSolarMwp ?? 0;
      const trafalgarSolarMwp = scheduleSummary.solarTrafalgarMwp ?? summaries.trafalgarSolarMwp ?? 0;
      const totalRenewableMwp = scheduleSummary.totalRenewableMwp ?? summaries.totalRenewableCapacity ?? (hampshireSolarMwp + prospectSolarMwp + trafalgarSolarMwp);
      const totalDbisCapacityMw = scheduleSummary.totalDbisCapacityMw ?? summaries.totalDBISCapacity ?? null;
      const eveningPeakOnBarsMw = scheduleSummary.eveningPeakOnBarsMw ?? null;
      const eveningPeakSuppressedMw = scheduleSummary.eveningPeakSuppressedMw ?? null;
      const dayPeakOnBarsMw = scheduleSummary.dayPeakOnBarsMw ?? null;
      const dayPeakSuppressedMw = scheduleSummary.dayPeakSuppressedMw ?? null;

      // Insert into gpl_daily_summary
      await client.query(
        `INSERT INTO gpl_daily_summary
         (report_date, total_fossil_capacity_mw, expected_peak_demand_mw, reserve_capacity_mw,
          average_for, hampshire_solar_mwp, prospect_solar_mwp, trafalgar_solar_mwp,
          total_renewable_mwp, total_dbis_capacity_mw, evening_peak_on_bars_mw,
          evening_peak_suppressed_mw, day_peak_on_bars_mw, day_peak_suppressed_mw, upload_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          reportDate, totalFossilCapacityMw, expectedPeakDemandMw, reserveCapacityMw,
          averageFor, hampshireSolarMwp, prospectSolarMwp, trafalgarSolarMwp,
          totalRenewableMwp, totalDbisCapacityMw, eveningPeakOnBarsMw,
          eveningPeakSuppressedMw, dayPeakOnBarsMw, dayPeakSuppressedMw, uploadId,
        ]
      );

      // Insert station data from schedule (aggregated by station)
      const stations = schedule?.stations || [];
      for (const station of stations) {
        await client.query(
          `INSERT INTO gpl_daily_stations
           (upload_id, report_date, station, total_units, total_derated_capacity_mw,
            total_available_mw, units_online, units_offline)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            uploadId,
            reportDate,
            station.station,
            station.totalUnits,
            station.totalDeratedCapacityMw,
            station.totalAvailableMw,
            station.unitsOnline,
            station.unitsOffline,
          ]
        );
      }

      // Insert individual unit data from schedule
      const units = schedule?.units || [];
      for (const unit of units) {
        await client.query(
          `INSERT INTO gpl_daily_units
           (upload_id, report_date, station, unit_number, engine,
            installed_capacity_mva, derated_capacity_mw, available_mw, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            uploadId,
            reportDate,
            unit.station,
            unit.unitNumber,
            unit.engine,
            unit.installedCapacityMva,
            unit.deratedCapacityMw,
            unit.availableMw,
            unit.status,
          ]
        );
      }

      return { uploadId };
    });

    // Audit log
    await auditService.log({
      userId: user.id,
      action: 'CREATE',
      entityType: 'gpl_uploads',
      entityId: result.uploadId,
      newValues: { reportDate, fileName: uploadData.fileName },
      request,
    });

    // Trigger async AI analysis (non-blocking)
    const schedule = uploadData.schedule;
    const stations = schedule?.stations || [];
    const units = schedule?.units || [];
    const summaries = uploadData.generationStatus?.summaries || {};
    const scheduleSummary = schedule?.summary || {};

    const onlineCount = units.filter((u: any) => u.status === 'online').length;
    const offlineCount = units.filter((u: any) => u.status === 'offline').length;
    const noDataCount = units.filter((u: any) => u.status === 'no_data').length;

    const criticalStations = stations
      .filter((s: any) => s.stationUtilizationPct !== null && s.stationUtilizationPct < 50)
      .map((s: any) => s.station);

    const briefingContext = {
      reportDate,
      systemOverview: {
        totalCapacityMw: scheduleSummary.totalFossilFuelCapacityMw ?? summaries.totalFossilCapacity,
        availableCapacityMw: schedule?.stats?.totalAvailableMw ?? null,
        expectedPeakMw: scheduleSummary.expectedPeakDemandMw ?? summaries.expectedPeakDemand,
        reserveCapacityMw: scheduleSummary.reserveCapacityMw ?? summaries.reserveCapacity,
        eveningPeak: {
          onBars: scheduleSummary.eveningPeakOnBarsMw ?? null,
          suppressed: scheduleSummary.eveningPeakSuppressedMw ?? null,
        },
      },
      renewables: {
        hampshireMwp: summaries.hampshireSolarMwp || 0,
        prospectMwp: summaries.prospectSolarMwp || 0,
        trafalgarMwp: summaries.trafalgarSolarMwp || 0,
        totalMwp: summaries.totalRenewableCapacity || 0,
      },
      unitStats: {
        total: units.length,
        online: onlineCount,
        offline: offlineCount,
        noData: noDataCount,
      },
      stations: stations.map((s: any) => ({
        name: s.station,
        units: s.totalUnits,
        online: s.unitsOnline,
        capacityMw: s.totalDeratedCapacityMw,
        availableMw: s.totalAvailableMw,
        utilizationPct: s.stationUtilizationPct,
      })),
      criticalStations,
      outages: uploadData.outages || [],
    };

    // Fire-and-forget: generate AI briefing and save to gpl_analysis
    generateGPLBriefing(briefingContext)
      .then(async (analysis) => {
        try {
          const { query: dbQuery } = await import('@/lib/db-pg');
          await dbQuery(
            `INSERT INTO gpl_analysis (upload_id, report_date, analysis_data, status)
             VALUES ($1, $2, $3, $4)`,
            [result.uploadId, reportDate, JSON.stringify(analysis), analysis.success ? 'completed' : 'failed']
          );
        } catch (err: any) {
          console.error('[gpl/upload/confirm] Failed to save analysis:', err.message);
        }
      })
      .catch((err: any) => {
        console.error('[gpl/upload/confirm] AI analysis failed:', err.message);
      });

    return NextResponse.json(
      {
        success: true,
        message: 'GPL DBIS data confirmed and saved successfully',
        uploadId: result.uploadId,
        reportDate,
        analysisStatus: 'pending',
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error('[gpl/upload/confirm] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to confirm GPL upload' },
      { status: 500 }
    );
  }
}
