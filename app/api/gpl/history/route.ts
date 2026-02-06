import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    // Get total count
    const { count, error: countError } = await supabaseAdmin
      .from('gpl_uploads')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    const total = count ?? 0;

    // Get uploads (no JOIN to users — just return uploaded_by as-is)
    const { data: uploads, error: uploadsError } = await supabaseAdmin
      .from('gpl_uploads')
      .select('id, report_date, file_name, uploaded_by, status, created_at')
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (uploadsError) throw uploadsError;

    return NextResponse.json({
      success: true,
      data: {
        uploads: (uploads || []).map((row) => ({
          id: row.id,
          reportDate: row.report_date,
          fileName: row.file_name,
          uploadedBy: row.uploaded_by,
          uploadedByName: row.uploaded_by || 'Unknown',
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
