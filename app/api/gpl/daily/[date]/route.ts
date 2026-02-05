import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

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
    const uploadResult = await query(
      `SELECT id, report_date, file_name, uploaded_by, status, created_at
       FROM gpl_uploads
       WHERE report_date = $1 AND status = 'confirmed'
       ORDER BY created_at DESC
       LIMIT 1`,
      [date]
    );

    if (uploadResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: `No confirmed GPL data found for ${date}` },
        { status: 404 }
      );
    }

    const upload = uploadResult.rows[0];

    // Get the daily summary
    const summaryResult = await query(
      `SELECT report_date, total_fossil_capacity_mw, expected_peak_demand_mw,
              reserve_capacity_mw, average_for, hampshire_solar_mwp, prospect_solar_mwp,
              trafalgar_solar_mwp, total_renewable_mwp, total_dbis_capacity_mw,
              evening_peak_on_bars_mw, evening_peak_suppressed_mw,
              day_peak_on_bars_mw, day_peak_suppressed_mw
       FROM gpl_daily_summary
       WHERE upload_id = $1`,
      [upload.id]
    );

    // Get station data
    const stationsResult = await query(
      `SELECT station, total_units, total_derated_capacity_mw,
              total_available_mw, units_online, units_offline
       FROM gpl_daily_stations
       WHERE upload_id = $1
       ORDER BY station`,
      [upload.id]
    );

    return NextResponse.json({
      success: true,
      data: {
        upload: {
          id: upload.id,
          reportDate: upload.report_date,
          fileName: upload.file_name,
          uploadedAt: upload.created_at,
        },
        summary: summaryResult.rows[0] || null,
        stations: stationsResult.rows,
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
