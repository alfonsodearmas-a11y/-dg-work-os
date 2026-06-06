import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { GPL_SUMMARY_SELECT } from '@/lib/gpl-constants';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;
  if (!canAccessAgency(session.user.role, session.user.agency, 'gpl')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { date } = await params;

  try {
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
      .select('id, report_date, filename, uploaded_by, status, created_at')
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
        GPL_SUMMARY_SELECT
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

    // Get AI analysis for this upload
    let analysis = null;
    const { data: analysisRows, error: analysisError } = await supabaseAdmin
      .from('gpl_analysis')
      .select('analysis_data, status')
      .eq('upload_id', upload.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!analysisError && analysisRows && analysisRows.length > 0) {
      const row = analysisRows[0];
      analysis = typeof row.analysis_data === 'string'
        ? JSON.parse(row.analysis_data)
        : row.analysis_data;
    }

    return NextResponse.json({
      success: true,
      data: {
        upload: {
          id: upload.id,
          reportDate: upload.report_date,
          fileName: upload.filename,
          uploadedAt: upload.created_at,
        },
        summary: summaryRows?.[0] || null,
        stations: stations || [],
        analysis,
      },
    });
  } catch (error: any) {
    logger.error({ err: error, date }, 'Failed to fetch GPL data for date');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch GPL data for date' },
      { status: 500 }
    );
  }
}
