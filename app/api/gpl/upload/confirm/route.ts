import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { auditService } from '@/lib/audit';
import { generateGPLBriefing } from '@/lib/ai-analysis';

export async function POST(request: NextRequest) {
  try {
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

    // Insert into gpl_uploads
    const { data: uploadRow, error: uploadError } = await supabaseAdmin
      .from('gpl_uploads')
      .insert({
        report_date: reportDate,
        filename: uploadData.fileName || 'gpl-dbis.xlsx',
        uploaded_by: 'dg-admin',
        status: 'confirmed',
        raw_data: uploadData,
      })
      .select('id')
      .single();

    if (uploadError) throw uploadError;

    const uploadId = uploadRow.id;

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

    // Remove any previous data for this date (allows re-uploads)
    await supabaseAdmin.from('gpl_daily_units').delete().eq('report_date', reportDate);
    await supabaseAdmin.from('gpl_daily_stations').delete().eq('report_date', reportDate);
    await supabaseAdmin.from('gpl_daily_summary').delete().eq('report_date', reportDate);

    // Insert into gpl_daily_summary
    const { error: summaryError } = await supabaseAdmin
      .from('gpl_daily_summary')
      .insert({
        upload_id: uploadId,
        report_date: reportDate,
        total_fossil_capacity_mw: totalFossilCapacityMw,
        expected_peak_demand_mw: expectedPeakDemandMw,
        reserve_capacity_mw: reserveCapacityMw,
        average_for: averageFor,
        hampshire_solar_mwp: hampshireSolarMwp,
        prospect_solar_mwp: prospectSolarMwp,
        trafalgar_solar_mwp: trafalgarSolarMwp,
        total_renewable_mwp: totalRenewableMwp,
        total_dbis_capacity_mw: totalDbisCapacityMw,
        evening_peak_on_bars_mw: eveningPeakOnBarsMw,
        evening_peak_suppressed_mw: eveningPeakSuppressedMw,
        day_peak_on_bars_mw: dayPeakOnBarsMw,
        day_peak_suppressed_mw: dayPeakSuppressedMw,
      });

    if (summaryError) throw summaryError;

    // Insert station data from schedule (aggregated by station)
    const stations = schedule?.stations || [];
    if (stations.length > 0) {
      const stationRows = stations.map((station: any) => ({
        upload_id: uploadId,
        report_date: reportDate,
        station: station.station,
        total_units: station.totalUnits,
        total_derated_capacity_mw: station.totalDeratedCapacityMw,
        total_available_mw: station.totalAvailableMw,
        units_online: station.unitsOnline,
        units_offline: station.unitsOffline,
      }));

      const { error: stationsError } = await supabaseAdmin
        .from('gpl_daily_stations')
        .insert(stationRows);

      if (stationsError) throw stationsError;
    }

    // Insert individual unit data from schedule
    const units = schedule?.units || [];
    if (units.length > 0) {
      const unitRows = units.map((unit: any) => ({
        upload_id: uploadId,
        report_date: reportDate,
        station: unit.station,
        unit_number: unit.unitNumber,
        engine: unit.engine,
        installed_capacity_mva: unit.installedCapacityMva,
        derated_capacity_mw: unit.deratedCapacityMw,
        available_mw: unit.availableMw,
        status: unit.status,
      }));

      const { error: unitsError } = await supabaseAdmin
        .from('gpl_daily_units')
        .insert(unitRows);

      if (unitsError) throw unitsError;
    }

    // Audit log
    await auditService.log({
      userId: 'dg-admin',
      action: 'CREATE',
      entityType: 'gpl_uploads',
      entityId: uploadId,
      newValues: { reportDate, fileName: uploadData.fileName },
      request,
    });

    // Trigger async AI analysis (non-blocking)
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
          const { error: analysisError } = await supabaseAdmin
            .from('gpl_analysis')
            .insert({
              upload_id: uploadId,
              report_date: reportDate,
              analysis_data: analysis,
              status: analysis.success ? 'completed' : 'failed',
            });

          if (analysisError) {
            console.error('[gpl/upload/confirm] Failed to save analysis:', analysisError.message);
          }
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
        uploadId,
        reportDate,
        analysisStatus: 'pending',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[gpl/upload/confirm] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to confirm GPL upload' },
      { status: 500 }
    );
  }
}
