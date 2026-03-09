import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

const COLUMNS = 'id,agency,customer_reference,first_name,last_name,telephone,region,district,village_ward,street,lot,event_code,event_description,application_date,days_waiting,data_as_of,pipeline_stage,account_type,service_order_type,service_order_number,account_status,cycle,division_code';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = request.nextUrl;
    const agency = searchParams.get('agency') || 'all';
    const region = searchParams.get('region');
    const minDays = searchParams.get('minDays');
    const maxDays = searchParams.get('maxDays');
    const search = searchParams.get('search');
    const stage = searchParams.get('stage');
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

    let query = supabaseAdmin
      .from('pending_applications')
      .select(COLUMNS, { count: 'exact' });

    if (agency !== 'all') {
      query = query.eq('agency', agency.toUpperCase());
    }
    if (region) {
      const sanitizedRegion = region.replace(/[%_.*(),"\\]/g, '');
      if (sanitizedRegion) query = query.ilike('region', `%${sanitizedRegion}%`);
    }
    if (minDays) {
      query = query.gte('days_waiting', parseInt(minDays));
    }
    if (maxDays) {
      query = query.lte('days_waiting', parseInt(maxDays));
    }
    if (stage) {
      query = query.eq('pipeline_stage', stage);
    }
    if (search) {
      const sanitized = search.replace(/[%_.*(),"\\]/g, '');
      if (sanitized) {
        query = query.or(
          `first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%,telephone.ilike.%${sanitized}%,customer_reference.ilike.%${sanitized}%,village_ward.ilike.%${sanitized}%`
        );
      }
    }

    const offset = (page - 1) * pageSize;
    query = query
      .order(sortCol, { ascending })
      .range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;

    if (error) {
      logger.error({ err: error, dbMessage: error.message }, 'Pending applications DB error');
      return NextResponse.json({ error: 'Failed to fetch records' }, { status: 500 });
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
      pipelineStage: row.pipeline_stage || undefined,
      accountType: row.account_type || undefined,
      serviceOrderType: row.service_order_type || undefined,
      serviceOrderNumber: row.service_order_number || undefined,
      accountStatus: row.account_status || undefined,
      cycle: row.cycle || undefined,
      divisionCode: row.division_code || undefined,
    }));

    return NextResponse.json({
      records,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (err) {
    logger.error({ err }, 'Pending applications error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
