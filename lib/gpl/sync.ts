// GPL Grid Health — Sync Logic
// Fetches data from GPL System Control Dashboard API, caches locally in Supabase.

import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';
import { GPL_CONFIG } from './config';
import type { GplOutage, GplFeeder, GplSubstation, GplCauseCode } from './types';

// ── Types for raw API responses ─────────────────────────────────────────────

interface FetchResult {
  outages: GplOutage[];
  feeders: GplFeeder[];
  substations: GplSubstation[];
  causeCodes: GplCauseCode[];
}

interface SyncResult {
  synced: boolean;
  outages_synced: number;
  feeders_synced: number;
  new_outage_records: number;
  error?: string;
}

// ── Fetch from GPL Dashboard ────────────────────────────────────────────────

export async function fetchFromGplDashboard(): Promise<FetchResult> {
  const { baseUrl, endpoints } = GPL_CONFIG.source;

  const [outagesRes, feedersRes, substationsRes, causeCodesRes] = await Promise.all([
    fetch(`${baseUrl}${endpoints.outages}`),
    fetch(`${baseUrl}${endpoints.feeders}`),
    fetch(`${baseUrl}${endpoints.substations}`),
    fetch(`${baseUrl}${endpoints.causeCodes}`),
  ]);

  if (!outagesRes.ok) throw new Error(`Outages API returned ${outagesRes.status}`);
  if (!feedersRes.ok) throw new Error(`Feeders API returned ${feedersRes.status}`);
  if (!substationsRes.ok) throw new Error(`Substations API returned ${substationsRes.status}`);
  if (!causeCodesRes.ok) throw new Error(`Cause codes API returned ${causeCodesRes.status}`);

  const [outages, feeders, substations, causeCodes] = await Promise.all([
    outagesRes.json() as Promise<GplOutage[]>,
    feedersRes.json() as Promise<GplFeeder[]>,
    substationsRes.json() as Promise<GplSubstation[]>,
    causeCodesRes.json() as Promise<GplCauseCode[]>,
  ]);

  return { outages, feeders, substations, causeCodes };
}

// ── Upsert Cache Tables ─────────────────────────────────────────────────────

export async function upsertOutageCache(outages: GplOutage[]): Promise<number> {
  if (outages.length === 0) return 0;

  // Get existing outage_ids to track new records
  const { data: existing } = await supabaseAdmin
    .from('gpl_outage_cache')
    .select('outage_id');
  const existingIds = new Set((existing ?? []).map((r: { outage_id: number }) => r.outage_id));

  const rows = outages.map((o) => ({
    outage_id: o.id,
    feeder_id: o.feeder_id,
    date: o.date,
    time_out: o.time_out,
    time_in: o.time_in,
    duration_minutes: o.duration_minutes,
    customers_affected: o.customers_affected,
    mw_lost: o.mw_lost,
    ens_mwh: o.ens_mwh,
    cause_category: o.cause_category,
    cause_subcategory: o.cause_subcategory,
    cause_detail: o.cause_detail,
    root_cause: o.root_cause,
    status: o.status,
    feeder_code: o.feeder_code,
    substation_code: o.substation_code,
    areas_affected: o.areas_affected,
    synced_at: new Date().toISOString(),
  }));

  // Upsert in batches of 100
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabaseAdmin
      .from('gpl_outage_cache')
      .upsert(batch, { onConflict: 'outage_id' });
    if (error) throw new Error(`Outage upsert failed: ${error.message}`);
  }

  const newCount = outages.filter((o) => !existingIds.has(o.id)).length;
  return newCount;
}

export async function upsertFeederCache(feeders: GplFeeder[]): Promise<void> {
  if (feeders.length === 0) return;

  const rows = feeders.map((f) => ({
    feeder_id: f.id,
    code: f.code,
    name: f.name,
    substation_code: f.substation_code,
    area_served: f.area_served,
    customer_count: f.customer_count,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from('gpl_feeder_cache')
    .upsert(rows, { onConflict: 'feeder_id' });
  if (error) throw new Error(`Feeder upsert failed: ${error.message}`);
}

// ── Staleness Check ─────────────────────────────────────────────────────────

export async function getLastSyncTime(): Promise<Date | null> {
  const { data, error } = await supabaseAdmin
    .from('gpl_outage_cache')
    .select('synced_at')
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return new Date(data.synced_at);
}

export async function isCacheStale(): Promise<boolean> {
  const lastSync = await getLastSyncTime();
  if (!lastSync) return true;

  const ageMinutes = (Date.now() - lastSync.getTime()) / 60_000;
  return ageMinutes > GPL_CONFIG.sync.staleAfterMinutes;
}

// ── Row Mappers (shared by API routes that read from cache) ─────────────────

export function mapOutageRow(r: Record<string, unknown>): GplOutage {
  return {
    id: r.outage_id as number,
    feeder_id: r.feeder_id as number,
    date: r.date as string,
    time_out: r.time_out as string | null,
    time_in: r.time_in as string | null,
    duration_minutes: r.duration_minutes as number | null,
    customers_affected: r.customers_affected as number | null,
    mw_lost: r.mw_lost as number | null,
    ens_mwh: r.ens_mwh as number | null,
    cause_detail: r.cause_detail as string | null,
    status: r.status as string,
    areas_affected: r.areas_affected as string | null,
    feeder_code: r.feeder_code as string | null,
    substation_code: r.substation_code as string | null,
    cause_category: r.cause_category as string | null,
    cause_subcategory: r.cause_subcategory as string | null,
    root_cause: r.root_cause as string | null,
  };
}

export function mapFeederRow(r: Record<string, unknown>): GplFeeder {
  return {
    id: r.feeder_id as number,
    code: r.code as string,
    name: r.name as string,
    substation_code: r.substation_code as string,
    area_served: r.area_served as string | null,
    customer_count: r.customer_count as number,
  };
}

// ── Full Sync Orchestration ─────────────────────────────────────────────────

export async function syncGplData(): Promise<SyncResult> {
  try {
    const data = await fetchFromGplDashboard();

    const [newOutages] = await Promise.all([
      upsertOutageCache(data.outages),
      upsertFeederCache(data.feeders),
    ]);

    logger.info(
      { outages: data.outages.length, feeders: data.feeders.length, newOutages },
      'GPL grid health sync complete'
    );

    return {
      synced: true,
      outages_synced: data.outages.length,
      feeders_synced: data.feeders.length,
      new_outage_records: newOutages,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown sync error';
    logger.error({ err }, 'GPL grid health sync failed');

    const lastSync = await getLastSyncTime();
    return {
      synced: false,
      outages_synced: 0,
      feeders_synced: 0,
      new_outage_records: 0,
      error: lastSync
        ? `Sync failed: ${message}. Last successful sync: ${lastSync.toISOString()}`
        : `Sync failed: ${message}. No cached data available.`,
    };
  }
}
