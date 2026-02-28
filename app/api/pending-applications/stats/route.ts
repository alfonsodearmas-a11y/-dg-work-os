import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { PendingApplicationStats } from '@/lib/pending-applications-types';

const COLUMNS = 'id,agency,customer_reference,first_name,last_name,telephone,region,district,village_ward,street,lot,event_code,event_description,application_date,days_waiting,data_as_of';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

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

  return { total, avgDaysWaiting, maxDaysWaiting, longestWaitCustomer, byRegion, waitBrackets, dataAsOf: String(rows[0].data_as_of || '') };
}

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data: allRows, error } = await supabase
      .from('pending_applications')
      .select(COLUMNS);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = allRows || [];
    const gplRows = rows.filter(r => r.agency === 'GPL');
    const gwiRows = rows.filter(r => r.agency === 'GWI');

    return NextResponse.json({
      gpl: buildStats(gplRows),
      gwi: buildStats(gwiRows),
    });
  } catch (err) {
    console.error('[pending-applications/stats] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
