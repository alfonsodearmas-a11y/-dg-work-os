import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { sanitizeSearchInput, parsePaginationParams } from '@/lib/parse-utils';

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
    const { page, pageSize, from, to } = parsePaginationParams(searchParams);

    let query = supabaseAdmin
      .from('service_connections')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (track) query = query.eq('track', track);
    if (region) query = query.eq('region', region);
    if (stage) query = query.eq('current_stage', stage);
    if (search) {
      // Sanitize: strip PostgREST filter special chars to prevent injection
      const sanitized = sanitizeSearchInput(search);
      if (sanitized) {
        query = query.or(`customer_reference.ilike.%${sanitized}%,first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%,service_order_number.ilike.%${sanitized}%`);
      }
    }

    const { data, count, error } = await query
      .order('application_date', { ascending: false })
      .range(from, to);

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
