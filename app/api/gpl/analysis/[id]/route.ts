import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { generateGPLBriefing } from '@/lib/ai-analysis';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Look up existing analysis for this upload
    const { data: analysisRows, error: analysisError } = await supabaseAdmin
      .from('gpl_analysis')
      .select('id, upload_id, report_date, analysis_data, status, created_at')
      .eq('upload_id', id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (analysisError) throw analysisError;

    if (analysisRows && analysisRows.length > 0) {
      const row = analysisRows[0];
      const analysisData = typeof row.analysis_data === 'string'
        ? JSON.parse(row.analysis_data)
        : row.analysis_data;

      return NextResponse.json({
        success: true,
        data: {
          id: row.id,
          uploadId: row.upload_id,
          reportDate: row.report_date,
          status: row.status,
          analysis: analysisData,
          createdAt: row.created_at,
        },
      });
    }

    // No existing analysis found -- attempt to generate one on the fly
    const { data: upload, error: uploadError } = await supabaseAdmin
      .from('gpl_uploads')
      .select('id, report_date, raw_data')
      .eq('id', id)
      .maybeSingle();

    if (uploadError) throw uploadError;

    if (!upload) {
      return NextResponse.json(
        { success: false, error: 'Upload not found' },
        { status: 404 }
      );
    }

    const rawData = typeof upload.raw_data === 'string'
      ? JSON.parse(upload.raw_data)
      : upload.raw_data;

    if (!rawData) {
      return NextResponse.json(
        { success: false, error: 'No raw data available for analysis. Please re-upload the file.' },
        { status: 422 }
      );
    }

    // Build context from stored raw data
    const schedule = rawData.schedule;
    const summaries = rawData.generationStatus?.summaries || {};
    const scheduleSummary = schedule?.summary || {};
    const stations = schedule?.stations || [];
    const units = schedule?.units || [];

    const onlineCount = units.filter((u: any) => u.status === 'online').length;
    const offlineCount = units.filter((u: any) => u.status === 'offline').length;
    const noDataCount = units.filter((u: any) => u.status === 'no_data').length;

    const criticalStations = stations
      .filter((s: any) => s.stationUtilizationPct !== null && s.stationUtilizationPct < 50)
      .map((s: any) => s.station);

    const briefingContext = {
      reportDate: upload.report_date,
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
      outages: rawData.outages || [],
    };

    const analysis = await generateGPLBriefing(briefingContext);

    // Persist the analysis
    const { error: insertError } = await supabaseAdmin
      .from('gpl_analysis')
      .insert({
        upload_id: id,
        report_date: upload.report_date,
        analysis_data: analysis,
        status: analysis.success ? 'completed' : 'failed',
      });

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      data: {
        uploadId: id,
        reportDate: upload.report_date,
        status: analysis.success ? 'completed' : 'failed',
        analysis,
        createdAt: new Date().toISOString(),
        generatedOnDemand: true,
      },
    });
  } catch (error: any) {
    console.error('[gpl/analysis] GET Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch GPL analysis' },
      { status: 500 }
    );
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify the upload exists
    const { data: upload, error: uploadError } = await supabaseAdmin
      .from('gpl_uploads')
      .select('id, report_date, raw_data')
      .eq('id', id)
      .maybeSingle();

    if (uploadError) throw uploadError;

    if (!upload) {
      return NextResponse.json(
        { success: false, error: 'Upload not found' },
        { status: 404 }
      );
    }

    const rawData = typeof upload.raw_data === 'string'
      ? JSON.parse(upload.raw_data)
      : upload.raw_data;

    if (!rawData) {
      return NextResponse.json(
        { success: false, error: 'No raw data available for analysis. Please re-upload the file.' },
        { status: 422 }
      );
    }

    // Build context from stored raw data
    const schedule = rawData.schedule;
    const summaries = rawData.generationStatus?.summaries || {};
    const scheduleSummary = schedule?.summary || {};
    const stations = schedule?.stations || [];
    const units = schedule?.units || [];

    const onlineCount = units.filter((u: any) => u.status === 'online').length;
    const offlineCount = units.filter((u: any) => u.status === 'offline').length;
    const noDataCount = units.filter((u: any) => u.status === 'no_data').length;

    const criticalStations = stations
      .filter((s: any) => s.stationUtilizationPct !== null && s.stationUtilizationPct < 50)
      .map((s: any) => s.station);

    const briefingContext = {
      reportDate: upload.report_date,
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
      outages: rawData.outages || [],
    };

    // Generate fresh analysis
    const analysis = await generateGPLBriefing(briefingContext);

    // Check if an existing analysis record exists
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from('gpl_analysis')
      .select('id')
      .eq('upload_id', id);

    if (existingError) throw existingError;

    if (existingRows && existingRows.length > 0) {
      // Update existing record
      const { error: updateError } = await supabaseAdmin
        .from('gpl_analysis')
        .update({
          analysis_data: analysis,
          status: analysis.success ? 'completed' : 'failed',
          created_at: new Date().toISOString(),
        })
        .eq('upload_id', id);

      if (updateError) throw updateError;
    } else {
      // Insert new record
      const { error: insertError } = await supabaseAdmin
        .from('gpl_analysis')
        .insert({
          upload_id: id,
          report_date: upload.report_date,
          analysis_data: analysis,
          status: analysis.success ? 'completed' : 'failed',
        });

      if (insertError) throw insertError;
    }

    return NextResponse.json({
      success: true,
      message: 'Analysis regenerated successfully',
      data: {
        uploadId: id,
        reportDate: upload.report_date,
        status: analysis.success ? 'completed' : 'failed',
        analysis,
      },
    });
  } catch (error: any) {
    console.error('[gpl/analysis] POST Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to regenerate GPL analysis' },
      { status: 500 }
    );
  }
}
