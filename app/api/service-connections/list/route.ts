import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const track = searchParams.get('track');
    const region = searchParams.get('region');
    const stage = searchParams.get('stage');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50', 10), 200);

    let query = supabaseAdmin
      .from('service_connections')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (track) query = query.eq('track', track);
    if (region) query = query.eq('region', region);
    if (stage) query = query.eq('current_stage', stage);
    if (search) {
      // Sanitize: strip PostgREST filter special chars to prevent injection
      const sanitized = search.replace(/[%_.*(),"\\]/g, '');
      if (sanitized) {
        query = query.or(`customer_reference.ilike.%${sanitized}%,first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%,service_order_number.ilike.%${sanitized}%`);
      }
    }

    const from = (page - 1) * pageSize;
    const { data, count, error } = await query
      .order('application_date', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch service connections' }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (err) {
    logger.error({ err }, 'Service connection list fetch failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
