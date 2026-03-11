import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { computeGPLAnalysis, computeGWIAnalysis } from '@/lib/pending-applications-analysis';
import { generateGPLDeepAnalysis, generateGWIDeepAnalysis } from '@/lib/pending-applications-ai';
import type { PendingApplication } from '@/lib/pending-applications-types';
import { parseBody, withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

const PENDING_APP_COLUMNS = 'id, agency, customer_reference, first_name, last_name, telephone, region, district, village_ward, street, lot, event_code, event_description, application_date, days_waiting, data_as_of, pipeline_stage, account_type, service_order_type, service_order_number, account_status, cycle, division_code';

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
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const agency = request.nextUrl.searchParams.get('agency')?.toUpperCase();
    if (agency !== 'GPL' && agency !== 'GWI') {
      return NextResponse.json({ error: 'agency parameter required (GPL or GWI)' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('pending_application_analyses')
      .select('id, agency, analysis_type, analysis_date, result, status, created_at')
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
    logger.error({ err, agency: request.nextUrl.searchParams.get('agency') }, 'Deep analysis GET error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const deepAnalysisSchema = z.object({
  agency: z.string().min(1),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await parseBody(request, deepAnalysisSchema);
  if (error) return error;

  const agency = data!.agency.toUpperCase();
  if (agency !== 'GPL' && agency !== 'GWI') {
    return NextResponse.json({ error: 'agency field required (GPL or GWI)' }, { status: 400 });
  }

  const { data: rows, error: fetchError } = await supabaseAdmin
    .from('pending_applications')
    .select(PENDING_APP_COLUMNS)
    .eq('agency', agency);

  if (fetchError) {
    return NextResponse.json({ error: 'Failed to fetch pending applications' }, { status: 500 });
  }

  const records = (rows || []).map(mapRow);
  if (records.length === 0) {
    return NextResponse.json({ error: `No ${agency} records found` }, { status: 404 });
  }

  const structuredAnalysis = agency === 'GPL' ? computeGPLAnalysis(records) : computeGWIAnalysis(records);

  const result = agency === 'GPL'
    ? await generateGPLDeepAnalysis(records, structuredAnalysis as ReturnType<typeof computeGPLAnalysis>)
    : await generateGWIDeepAnalysis(records, structuredAnalysis as ReturnType<typeof computeGWIAnalysis>);

  if (!result.success) {
    return NextResponse.json({ error: 'AI analysis generation failed' }, { status: 500 });
  }

  const { data: saved, error: saveError } = await supabaseAdmin
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
    .select('id, analysis_date, created_at')
    .single();

  if (saveError) {
    logger.error({ err: saveError, agency }, 'Deep analysis save error');
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
});
