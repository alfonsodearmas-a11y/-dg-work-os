import { createClient } from '@supabase/supabase-js';
import type { PendingRecord, Snapshot } from './pending-applications-types';
import { logger } from '@/lib/logger';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function createSnapshot(agency: 'GPL' | 'GWI', records: PendingRecord[], dataAsOf: string): Promise<void> {
  const supabase = getSupabase();
  const totalCount = records.length;
  const days = records.map(r => r.days_waiting);
  const avgDaysWaiting = totalCount > 0 ? Math.round(days.reduce((a, b) => a + b, 0) / totalCount) : 0;
  const maxDaysWaiting = totalCount > 0 ? Math.max(...days) : 0;
  const over30Count = days.filter(d => d > 30).length;

  const summaryData: Record<string, unknown> = { avgDaysWaiting, maxDaysWaiting, over30Count };

  if (agency === 'GPL') {
    const byStage: Record<string, number> = {};
    for (const r of records) {
      const stage = r.pipeline_stage || 'Unknown';
      byStage[stage] = (byStage[stage] || 0) + 1;
    }
    summaryData.byStage = byStage;
  } else {
    const byRegion: Record<string, number> = {};
    for (const r of records) {
      const region = r.region || 'Unknown';
      byRegion[region] = (byRegion[region] || 0) + 1;
    }
    summaryData.byRegion = byRegion;
  }

  const { error } = await supabase
    .from('pending_application_snapshots')
    .upsert({
      agency,
      snapshot_date: dataAsOf,
      total_count: totalCount,
      summary_data: summaryData,
    }, { onConflict: 'agency,snapshot_date' });

  if (error) {
    logger.error({ err: error, agency }, 'snapshots: error creating snapshot');
  }
}

export async function getSnapshots(agency?: 'GPL' | 'GWI', limit = 30): Promise<Snapshot[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('pending_application_snapshots')
    .select('id,agency,snapshot_date,total_count,summary_data')
    .order('snapshot_date', { ascending: true })
    .limit(limit);

  if (agency) {
    query = query.eq('agency', agency);
  }

  const { data, error } = await query;
  if (error) {
    logger.error({ err: error }, 'snapshots: error fetching');
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    agency: row.agency as 'GPL' | 'GWI',
    snapshotDate: row.snapshot_date,
    totalCount: row.total_count,
    summaryData: row.summary_data || {},
  }));
}
