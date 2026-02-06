import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { date } = await params;

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format. Use YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    // Get the upload for this date
    const { data: upload, error: uploadError } = await supabaseAdmin
      .from('gpl_uploads')
      .select('id, report_date, file_name, uploaded_by, status, created_at')
      .eq('report_date', date)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (uploadError) throw uploadError;

    if (!upload) {
      return NextResponse.json(
        { success: false, error: `No confirmed GPL data found for ${date}` },
        { status: 404 }
      );
    }

    // Get the daily summary
    const { data: summaryRows, error: summaryError } = await supabaseAdmin
      .from('gpl_daily_summary')
      .select(
        'report_date, total_fossil_capacity_mw, expected_peak_demand_mw, reserve_capacity_mw, average_for, hampshire_solar_mwp, prospect_solar_mwp, trafalgar_solar_mwp, total_renewable_mwp, total_dbis_capacity_mw, evening_peak_on_bars_mw, evening_peak_suppressed_mw, day_peak_on_bars_mw, day_peak_suppressed_mw'
      )
      .eq('upload_id', upload.id);

    if (summaryError) throw summaryError;

    // Get station data
    const { data: stations, error: stationsError } = await supabaseAdmin
      .from('gpl_daily_stations')
      .select('station, total_units, total_derated_capacity_mw, total_available_mw, units_online, units_offline')
      .eq('upload_id', upload.id)
      .order('station', { ascending: true });

    if (stationsError) throw stationsError;

    return NextResponse.json({
      success: true,
      data: {
        upload: {
          id: upload.id,
          reportDate: upload.report_date,
          fileName: upload.file_name,
          uploadedAt: upload.created_at,
        },
        summary: summaryRows?.[0] || null,
        stations: stations || [],
      },
    });
  } catch (error: any) {
    console.error('[gpl/daily] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch GPL data for date' },
      { status: 500 }
    );
  }
}
