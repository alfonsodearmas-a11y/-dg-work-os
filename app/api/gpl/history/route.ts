import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM gpl_uploads`
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Get uploads with user info
    const uploadsResult = await query(
      `SELECT gu.id, gu.report_date, gu.file_name, gu.uploaded_by, gu.status,
              gu.created_at, u.full_name as uploaded_by_name, u.username
       FROM gpl_uploads gu
       LEFT JOIN users u ON gu.uploaded_by = u.id
       ORDER BY gu.report_date DESC, gu.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return NextResponse.json({
      success: true,
      data: {
        uploads: uploadsResult.rows.map((row) => ({
          id: row.id,
          reportDate: row.report_date,
          fileName: row.file_name,
          uploadedBy: row.uploaded_by,
          uploadedByName: row.uploaded_by_name || row.username || 'Unknown',
          status: row.status,
          createdAt: row.created_at,
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      },
    });
  } catch (error: any) {
    console.error('[gpl/history] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch GPL upload history' },
      { status: 500 }
    );
  }
}
