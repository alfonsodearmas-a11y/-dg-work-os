import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db-admin';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { GPL_SUMMARY_SELECT } from '@/lib/gpl-constants';

export async function GET(_request: NextRequest) {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  // Agency scoping: only GPL staff or ministry users can view GPL data
  if (!canAccessAgency(session.user.role, session.user.agency, 'gpl')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    // Get the latest confirmed upload
    const { data: upload, error: uploadError } = await supabaseAdmin
      .from('gpl_uploads')
      .select('id, report_date, filename, uploaded_by, status, created_at')
      .eq('status', 'confirmed')
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (uploadError) throw uploadError;

    if (!upload) {
      return NextResponse.json(
        { success: false, error: 'No confirmed GPL uploads found' },
        { status: 404 }
      );
    }

    // Get the daily summary for this upload
    const { data: summaryRows, error: summaryError } = await supabaseAdmin
      .from('gpl_daily_summary')
      .select(
        GPL_SUMMARY_SELECT
      )
      .eq('upload_id', upload.id);

    if (summaryError) throw summaryError;

    // Get station data for this upload
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
    logger.error({ err: error }, 'Failed to fetch latest GPL data');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch latest GPL data' },
      { status: 500 }
    );
  }
}
