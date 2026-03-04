import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const track = searchParams.get('track');
    const region = searchParams.get('region');
    const stage = searchParams.get('stage');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50', 10), 200);

    const supabase = getSupabase();

    let query = supabase
      .from('service_connections')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (track) query = query.eq('track', track);
    if (region) query = query.eq('region', region);
    if (stage) query = query.eq('current_stage', stage);
    if (search) {
      query = query.or(`customer_reference.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,service_order_number.ilike.%${search}%`);
    }

    const from = (page - 1) * pageSize;
    const { data, count, error } = await query
      .order('application_date', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (err) {
    console.error('[service-connections/list] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
