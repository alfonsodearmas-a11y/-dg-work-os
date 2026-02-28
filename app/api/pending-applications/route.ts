import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const COLUMNS = 'id,agency,customer_reference,first_name,last_name,telephone,region,district,village_ward,street,lot,event_code,event_description,application_date,days_waiting,data_as_of';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const agency = searchParams.get('agency') || 'all';
    const region = searchParams.get('region');
    const minDays = searchParams.get('minDays');
    const maxDays = searchParams.get('maxDays');
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sortBy') || 'days_waiting';
    const order = searchParams.get('order') || 'desc';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');

    const sortColumn: Record<string, string> = {
      days_waiting: 'days_waiting',
      application_date: 'application_date',
      last_name: 'last_name',
      region: 'region',
      agency: 'agency',
    };
    const sortCol = sortColumn[sortBy] || 'days_waiting';
    const ascending = order === 'asc';

    const supabase = getSupabase();
    let query = supabase
      .from('pending_applications')
      .select(COLUMNS, { count: 'exact' });

    if (agency !== 'all') {
      query = query.eq('agency', agency.toUpperCase());
    }
    if (region) {
      query = query.ilike('region', `%${region}%`);
    }
    if (minDays) {
      query = query.gte('days_waiting', parseInt(minDays));
    }
    if (maxDays) {
      query = query.lte('days_waiting', parseInt(maxDays));
    }
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,telephone.ilike.%${search}%,customer_reference.ilike.%${search}%,village_ward.ilike.%${search}%`
      );
    }

    const offset = (page - 1) * pageSize;
    query = query
      .order(sortCol, { ascending })
      .range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const records = (data || []).map(row => ({
      id: row.id,
      agency: row.agency,
      customerReference: row.customer_reference || '',
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      telephone: row.telephone || '',
      region: row.region || '',
      district: row.district || '',
      villageWard: row.village_ward || '',
      street: row.street || '',
      lot: row.lot || '',
      eventCode: row.event_code || '',
      eventDescription: row.event_description || '',
      applicationDate: row.application_date || '',
      daysWaiting: row.days_waiting,
      dataAsOf: row.data_as_of || '',
    }));

    return NextResponse.json({
      records,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (err) {
    console.error('[pending-applications] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
