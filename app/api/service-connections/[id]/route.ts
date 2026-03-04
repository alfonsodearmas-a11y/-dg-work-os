import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    const { data, error } = await supabase
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
      const { data: linked } = await supabase
        .from('service_connections')
        .select('id, service_order_number, current_stage, status, application_date, total_days_to_complete')
        .eq('service_order_number', data.linked_so_number)
        .single();
      linkedOrder = linked;
    }

    return NextResponse.json({ ...data, linkedOrder });
  } catch (err) {
    console.error('[service-connections/[id]] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
