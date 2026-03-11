import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

const SC_COLUMNS = 'id, customer_reference, service_order_number, first_name, last_name, telephone, region, district, village_ward, street, lot, account_type, service_order_type, division_code, cycle, application_date, track, job_complexity, status, current_stage, stage_history, first_seen_date, last_seen_date, disappeared_date, energisation_date, total_days_to_complete, is_legacy, linked_so_number, raw_data, created_at, updated_at';

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
      .select(SC_COLUMNS)
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
