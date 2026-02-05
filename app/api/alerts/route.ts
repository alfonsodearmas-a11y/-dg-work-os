import { NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET() {
  try {
    const result = await query(
      `SELECT * FROM alerts WHERE is_active = true AND resolved_at IS NULL
       ORDER BY severity DESC, created_at DESC LIMIT 50`
    );
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
