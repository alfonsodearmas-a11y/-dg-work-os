import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeMonthlyVolumes } from '@/lib/service-connection-analysis';
import type { ServiceConnection } from '@/lib/service-connection-types';

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
    const months = parseInt(searchParams.get('months') || '12', 10);
    const track = searchParams.get('track') || 'all';

    const supabase = getSupabase();

    let query = supabase
      .from('service_connections')
      .select('*')
      .neq('status', 'legacy_excluded')
      .not('is_legacy', 'eq', true);

    if (track !== 'all') {
      query = query.eq('track', track);
    }

    const { data, error } = await query.order('application_date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const volumes = computeMonthlyVolumes((data || []) as ServiceConnection[]);
    const recentMonths = volumes.slice(-months);

    return NextResponse.json({ months: recentMonths, track });
  } catch (err) {
    console.error('[service-connections/trends] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
