import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET(_request: NextRequest) {
  try {
    // Get the latest confirmed upload
    const uploadResult = await query(
      `SELECT id, report_date, file_name, uploaded_by, status, created_at
       FROM gpl_uploads
       WHERE status = 'confirmed'
       ORDER BY report_date DESC, created_at DESC
       LIMIT 1`
    );

    if (uploadResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No confirmed GPL uploads found' },
        { status: 404 }
      );
    }

    const upload = uploadResult.rows[0];

    // Get the daily summary for this upload
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

    // Get station data for this upload
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
    console.error('[gpl/latest] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch latest GPL data' },
      { status: 500 }
    );
  }
}
