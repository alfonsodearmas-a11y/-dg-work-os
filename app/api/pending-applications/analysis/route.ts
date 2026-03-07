import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { computeGPLAnalysis, computeGWIAnalysis } from '@/lib/pending-applications-analysis';
import type { PendingApplication } from '@/lib/pending-applications-types';

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

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const agency = request.nextUrl.searchParams.get('agency')?.toUpperCase();
    if (agency !== 'GPL' && agency !== 'GWI') {
      return NextResponse.json({ error: 'agency parameter required (GPL or GWI)' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('pending_applications')
      .select('*')
      .eq('agency', agency);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch pending applications' }, { status: 500 });
    }

    const records = (data || []).map(mapRow);

    if (records.length === 0) {
      return NextResponse.json({ agency, analysis: null, message: 'No records found' });
    }

    const analysis = agency === 'GPL' ? computeGPLAnalysis(records) : computeGWIAnalysis(records);

    return NextResponse.json({ agency, analysis, recordCount: records.length });
  } catch (err) {
    console.error('[pending-applications/analysis] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
