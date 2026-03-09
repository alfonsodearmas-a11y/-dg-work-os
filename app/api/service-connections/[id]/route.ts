import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from('service_connections')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Fetch linked order if exists
    let linkedOrder = null;
    if (data.linked_so_number) {
      const { data: linked } = await supabaseAdmin
        .from('service_connections')
        .select('id, service_order_number, current_stage, status, application_date, total_days_to_complete')
        .eq('service_order_number', data.linked_so_number)
        .single();
      linkedOrder = linked;
    }

    return NextResponse.json({ ...data, linkedOrder });
  } catch (err) {
    logger.error({ err }, 'Service connection detail fetch failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
