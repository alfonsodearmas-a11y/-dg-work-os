import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { query } from '@/lib/db-pg';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { date } = await params;

    const uploadResult = await query(
      `SELECT u.*, usr.full_name as uploaded_by_name
       FROM daily_uploads u LEFT JOIN users usr ON u.uploaded_by = usr.id
       WHERE u.report_date = $1`,
      [date]
    );

    if (uploadResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: `No data found for ${date}` }, { status: 404 });
    }

    const upload = uploadResult.rows[0];
    const valuesResult = await query(
      'SELECT * FROM daily_metric_values WHERE upload_id = $1 ORDER BY row_number',
      [upload.id]
    );

    const analysisResult = await query(
      'SELECT * FROM daily_upload_analysis WHERE upload_id = $1',
      [upload.id]
    );

    return NextResponse.json({
      success: true,
      data: { upload, records: valuesResult.rows, analysis: analysisResult.rows[0] || null },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: 'Failed to fetch daily upload data' }, { status: 500 });
  }
}
