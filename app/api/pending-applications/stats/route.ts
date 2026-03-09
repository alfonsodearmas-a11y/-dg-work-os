import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import type { PendingApplicationStats } from '@/lib/pending-applications-types';

const COLUMNS = 'id,agency,customer_reference,first_name,last_name,telephone,region,district,village_ward,street,lot,event_code,event_description,application_date,days_waiting,data_as_of,pipeline_stage,account_type,service_order_type,service_order_number,account_status,cycle,division_code';

function mapRow(row: Record<string, unknown>) {
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

function buildStats(rows: Record<string, unknown>[]): PendingApplicationStats {
  if (rows.length === 0) {
    return {
      total: 0, avgDaysWaiting: 0, maxDaysWaiting: 0,
      longestWaitCustomer: null, byRegion: [],
      waitBrackets: [
        { label: '< 7 days', min: 0, max: 7, count: 0 },
        { label: '7–14 days', min: 7, max: 14, count: 0 },
        { label: '15–30 days', min: 15, max: 30, count: 0 },
        { label: '> 30 days', min: 31, max: null, count: 0 },
      ],
      dataAsOf: '',
    };
  }

  const daysArr = rows.map(r => Number(r.days_waiting) || 0);
  const total = rows.length;
  const avgDaysWaiting = Math.round(daysArr.reduce((a, b) => a + b, 0) / total);
  const maxDaysWaiting = Math.max(...daysArr);

  const longestRow = rows.find(r => Number(r.days_waiting) === maxDaysWaiting);
  const longestWaitCustomer = longestRow ? mapRow(longestRow) : null;

  const regionMap = new Map<string, { count: number; totalDays: number; maxDays: number; over30: number }>();
  for (const row of rows) {
    const region = String(row.region || 'Unknown');
    const days = Number(row.days_waiting) || 0;
    const entry = regionMap.get(region) || { count: 0, totalDays: 0, maxDays: 0, over30: 0 };
    entry.count++;
    entry.totalDays += days;
    entry.maxDays = Math.max(entry.maxDays, days);
    if (days > 30) entry.over30++;
    regionMap.set(region, entry);
  }
  const byRegion = Array.from(regionMap.entries())
    .map(([region, d]) => ({
      region, count: d.count,
      avgDays: Math.round(d.totalDays / d.count),
      maxDays: d.maxDays, over30Count: d.over30,
    }))
    .sort((a, b) => b.count - a.count);

  const waitBrackets = [
    { label: '< 7 days', min: 0, max: 7, count: daysArr.filter(d => d < 7).length },
    { label: '7–14 days', min: 7, max: 14, count: daysArr.filter(d => d >= 7 && d <= 14).length },
    { label: '15–30 days', min: 15, max: 30, count: daysArr.filter(d => d >= 15 && d <= 30).length },
    { label: '> 30 days', min: 31, max: null, count: daysArr.filter(d => d > 30).length },
  ];

  // Build byStage breakdown for GPL records
  const stageMap = new Map<string, { count: number; totalDays: number; slaCompliant: number }>();
  for (const row of rows) {
    const stage = String(row.pipeline_stage || '');
    if (!stage) continue;
    const days = Number(row.days_waiting) || 0;
    const entry = stageMap.get(stage) || { count: 0, totalDays: 0, slaCompliant: 0 };
    entry.count++;
    entry.totalDays += days;
    // SLA thresholds: Metering 3d, Designs 12d, Execution 26d, others 14d
    const sla = stage === 'Metering' ? 3 : stage === 'Designs' ? 12 : stage === 'Execution' ? 26 : 14;
    if (days <= sla) entry.slaCompliant++;
    stageMap.set(stage, entry);
  }
  const byStage = stageMap.size > 0 ? Array.from(stageMap.entries())
    .map(([stage, d]) => ({
      stage,
      count: d.count,
      avgDays: Math.round(d.totalDays / d.count),
      slaCompliant: d.slaCompliant,
    }))
    .sort((a, b) => b.count - a.count) : undefined;

  return { total, avgDaysWaiting, maxDaysWaiting, longestWaitCustomer, byRegion, waitBrackets, byStage, dataAsOf: String(rows[0].data_as_of || '') };
}

export async function GET() {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const { data: allRows, error } = await supabaseAdmin
      .from('pending_applications')
      .select(COLUMNS);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch pending applications' }, { status: 500 });
    }

    const rows = allRows || [];
    const gplRows = rows.filter(r => r.agency === 'GPL');
    const gwiRows = rows.filter(r => r.agency === 'GWI');

    return NextResponse.json({
      gpl: buildStats(gplRows),
      gwi: buildStats(gwiRows),
    });
  } catch (err) {
    logger.error({ err }, 'Pending applications stats error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
