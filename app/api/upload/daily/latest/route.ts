import { NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET() {
  try {
    const uploadResult = await query(
      `SELECT u.*, usr.full_name as uploaded_by_name
       FROM daily_uploads u LEFT JOIN users usr ON u.uploaded_by = usr.id
       ORDER BY u.report_date DESC LIMIT 1`
    );

    if (uploadResult.rows.length === 0) {
      return NextResponse.json({ success: true, data: null });
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
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
