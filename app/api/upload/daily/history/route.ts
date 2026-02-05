import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '30');
    const offset = parseInt(searchParams.get('offset') || '0');

    const result = await query(
      `SELECT u.*, usr.full_name as uploaded_by_name
       FROM daily_uploads u LEFT JOIN users usr ON u.uploaded_by = usr.id
       ORDER BY u.report_date DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
