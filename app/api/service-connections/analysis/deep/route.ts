import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeEfficiencyMetrics } from '@/lib/service-connection-analysis';
import { generateEfficiencyAnalysis, getCachedAnalysis, saveAnalysis } from '@/lib/service-connection-ai';
import type { ServiceConnection } from '@/lib/service-connection-types';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  try {
    const cached = await getCachedAnalysis();
    if (cached) {
      return NextResponse.json({ analysis: cached, cached: true });
    }
    return NextResponse.json({ analysis: null, cached: false });
  } catch (err) {
    console.error('[service-connections/analysis/deep] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(_request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('service_connections')
      .select('*')
      .order('application_date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const connections = (data || []) as ServiceConnection[];
    if (connections.length === 0) {
      return NextResponse.json({ error: 'No service connection data available' }, { status: 400 });
    }

    const metrics = computeEfficiencyMetrics(connections);
    const analysis = await generateEfficiencyAnalysis(metrics, connections);
    await saveAnalysis(analysis);

    return NextResponse.json({ analysis, cached: false });
  } catch (err) {
    console.error('[service-connections/analysis/deep] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
