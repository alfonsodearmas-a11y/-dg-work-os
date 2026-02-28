import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeGPLAnalysis, computeGWIAnalysis } from '@/lib/pending-applications-analysis';
import { generateGPLDeepAnalysis, generateGWIDeepAnalysis } from '@/lib/pending-applications-ai';
import type { PendingApplication } from '@/lib/pending-applications-types';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function mapRow(row: Record<string, unknown>): PendingApplication {
  return {
    id: String(row.id || ''),
    agency: String(row.agency) as 'GPL' | 'GWI',
    customerReference: String(row.customer_reference || ''),
    firstName: String(row.first_name || ''),
    lastName: String(row.last_name || ''),
    telephone: String(row.telephone || ''),
    region: String(row.region || ''),
    district: String(row.district || ''),
    villageWard: String(row.village_ward || ''),
    street: String(row.street || ''),
    lot: String(row.lot || ''),
    eventCode: String(row.event_code || ''),
    eventDescription: String(row.event_description || ''),
    applicationDate: String(row.application_date || ''),
    daysWaiting: Number(row.days_waiting) || 0,
    dataAsOf: String(row.data_as_of || ''),
    pipelineStage: row.pipeline_stage ? String(row.pipeline_stage) : undefined,
    accountType: row.account_type ? String(row.account_type) : undefined,
    serviceOrderType: row.service_order_type ? String(row.service_order_type) : undefined,
    serviceOrderNumber: row.service_order_number ? String(row.service_order_number) : undefined,
    accountStatus: row.account_status ? String(row.account_status) : undefined,
    cycle: row.cycle ? String(row.cycle) : undefined,
    divisionCode: row.division_code ? String(row.division_code) : undefined,
  };
}

// GET — return latest saved analysis
export async function GET(request: NextRequest) {
  try {
    const agency = request.nextUrl.searchParams.get('agency')?.toUpperCase();
    if (agency !== 'GPL' && agency !== 'GWI') {
      return NextResponse.json({ error: 'agency parameter required (GPL or GWI)' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pending_application_analyses')
      .select('*')
      .eq('agency', agency)
      .eq('analysis_type', 'deep')
      .eq('status', 'completed')
      .order('analysis_date', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return NextResponse.json({ agency, analysis: null });
    }

    return NextResponse.json({
      agency,
      analysis: {
        id: data.id,
        agency: data.agency,
        analysisDate: data.analysis_date,
        ...data.result,
        createdAt: data.created_at,
      },
    });
  } catch (err) {
    console.error('[deep-analysis GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — generate fresh analysis
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const agency = String(body.agency || '').toUpperCase();
    if (agency !== 'GPL' && agency !== 'GWI') {
      return NextResponse.json({ error: 'agency field required (GPL or GWI)' }, { status: 400 });
    }

    const supabase = getSupabase();

    // Fetch all records for this agency
    const { data: rows, error: fetchError } = await supabase
      .from('pending_applications')
      .select('*')
      .eq('agency', agency);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const records = (rows || []).map(mapRow);
    if (records.length === 0) {
      return NextResponse.json({ error: `No ${agency} records found` }, { status: 404 });
    }

    // Compute structured analysis first
    const structuredAnalysis = agency === 'GPL' ? computeGPLAnalysis(records) : computeGWIAnalysis(records);

    // Generate AI deep analysis
    const result = agency === 'GPL'
      ? await generateGPLDeepAnalysis(records, structuredAnalysis as ReturnType<typeof computeGPLAnalysis>)
      : await generateGWIDeepAnalysis(records, structuredAnalysis as ReturnType<typeof computeGWIAnalysis>);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Persist
    const { data: saved, error: saveError } = await supabase
      .from('pending_application_analyses')
      .insert({
        agency,
        analysis_type: 'deep',
        result: {
          executiveSummary: result.executiveSummary,
          sections: result.sections,
          recommendations: result.recommendations,
        },
        status: 'completed',
      })
      .select('id,analysis_date,created_at')
      .single();

    if (saveError) {
      console.error('[deep-analysis] Save error:', saveError.message);
    }

    return NextResponse.json({
      agency,
      analysis: {
        id: saved?.id,
        agency,
        analysisDate: saved?.analysis_date,
        executiveSummary: result.executiveSummary,
        sections: result.sections,
        recommendations: result.recommendations,
        createdAt: saved?.created_at,
      },
    });
  } catch (err) {
    console.error('[deep-analysis POST] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
