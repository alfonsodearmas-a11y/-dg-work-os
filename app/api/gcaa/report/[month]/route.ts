import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params;

  try {
    // Accept YYYY-MM or YYYY-MM-DD, normalize to first of month
    const normalizedMonth = month.length === 7 ? `${month}-01` : month;

    const { data, error } = await supabaseAdmin
      .from('gcaa_monthly_reports')
      .select('*')
      .eq('report_month', normalizedMonth)
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
