import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { data, error } = await supabaseAdmin
      .from('gcaa_monthly_reports')
      .select('*')
      .order('report_month', { ascending: false })
      .limit(2);

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to fetch report' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data?.[0] ?? null,
      previous: data?.[1] ?? null,
    });
  } catch (err: unknown) {
    console.error('[gcaa/report/latest] Error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
