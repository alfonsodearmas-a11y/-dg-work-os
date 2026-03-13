// Service Connection Diff Engine
// Compares new upload against existing open service_connections to detect completions.

import { createClient } from '@supabase/supabase-js';
import type { DiffResult, StageHistoryEntry } from './service-connection-types';
import type { PendingRecord } from './pending-applications-types';
import { LEGACY_CUTOFF } from './service-connection-types';
import { classifyTrack } from './service-connection-track';
import { logger } from '@/lib/logger';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Build a match key from customer_reference + service_order_number */
function matchKey(custRef: string | null | undefined, soNum: string | null | undefined): string {
  const c = (custRef || '').trim().toUpperCase();
  const s = (soNum || '').trim().toUpperCase();
  return `${c}||${s}`;
}


/** Check if application date is before legacy cutoff */
function isLegacy(applicationDate: string | null): boolean {
  if (!applicationDate) return false;
  return applicationDate < LEGACY_CUTOFF;
}

const BATCH_SIZE = 50;

/** Calculate days between two ISO date strings */
function daysBetween(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Process a GPL upload diff: compare new records against existing open connections.
 * Must be called BEFORE the DELETE+INSERT in the upload route.
 */
export async function processUploadDiff(
  newRecords: PendingRecord[],
  dataAsOf: string
): Promise<DiffResult> {
  const supabase = getSupabase();

  // Fetch all existing open connections (override Supabase default 1000-row limit)
  const { data: existing, error } = await supabase
    .from('service_connections')
    .select('*')
    .eq('status', 'open')
    .limit(10000);

  if (error) {
    logger.error({ err: error }, 'service-connection-diff: error fetching existing');
    return { disappeared: 0, newOrders: 0, updated: 0, stillOpen: 0, legacyExcluded: 0, completedIds: [] };
  }

  const existingMap = new Map<string, typeof existing[0]>();
  const existingByRef = new Map<string, typeof existing[0][]>();

  for (const row of existing || []) {
    const key = matchKey(row.customer_reference, row.service_order_number);
    existingMap.set(key, row);

    // Also index by customer_reference alone for fallback matching
    const ref = (row.customer_reference || '').trim().toUpperCase();
    if (ref) {
      if (!existingByRef.has(ref)) existingByRef.set(ref, []);
      existingByRef.get(ref)!.push(row);
    }
  }

  // Build set of new upload keys
  const newKeys = new Set<string>();
  const newByKey = new Map<string, PendingRecord>();
  for (const rec of newRecords) {
    const key = matchKey(rec.customer_reference, rec.service_order_number);
    newKeys.add(key);
    newByKey.set(key, rec);
  }

  const result: DiffResult = {
    disappeared: 0,
    newOrders: 0,
    updated: 0,
    stillOpen: 0,
    legacyExcluded: 0,
    completedIds: [],
  };

  // 1. Detect disappeared (completed) orders — batch the updates
  const disappearedIds: string[] = [];
  const disappearedRows: typeof existing = [];

  for (const [key, row] of existingMap) {
    if (!newKeys.has(key)) {
      // Try fallback: match by customer_reference if SO# mismatch
      const ref = (row.customer_reference || '').trim().toUpperCase();
      const soNum = (row.service_order_number || '').trim().toUpperCase();
      let foundFallback = false;

      if (ref && soNum) {
        // Check if same customer_ref exists in new upload with different/null SO#
        for (const [, nr] of newByKey) {
          const nRef = (nr.customer_reference || '').trim().toUpperCase();
          const nSo = (nr.service_order_number || '').trim().toUpperCase();
          if (nRef === ref && nSo !== soNum && !nSo) {
            foundFallback = true;
            break;
          }
        }
      }

      if (!foundFallback) {
        disappearedIds.push(row.id);
        disappearedRows.push(row);
      }
    }
  }

  // Batch-update disappeared orders as completed
  for (let i = 0; i < disappearedIds.length; i += BATCH_SIZE) {
    const batchIds = disappearedIds.slice(i, i + BATCH_SIZE);
    // All get same status fields; total_days_to_complete varies per row
    // but we can't do per-row values in a batch update, so we update in two passes:
    // First set the common fields, then update days per-row via individual calls only when needed

    const { error: updateError } = await supabase
      .from('service_connections')
      .update({
        status: 'completed',
        disappeared_date: dataAsOf,
        energisation_date: dataAsOf,
        updated_at: new Date().toISOString(),
      })
      .in('id', batchIds);

    if (!updateError) {
      result.disappeared += batchIds.length;
      result.completedIds.push(...batchIds);
    }
  }

  // Set per-row total_days_to_complete for disappeared rows (batch by computed days)
  // Group by days value to minimize queries
  const daysBuckets = new Map<number | null, string[]>();
  for (const row of disappearedRows) {
    const totalDays = row.application_date ? daysBetween(row.application_date, dataAsOf) : null;
    const key = totalDays;
    if (!daysBuckets.has(key)) daysBuckets.set(key, []);
    daysBuckets.get(key)!.push(row.id);
  }

  for (const [days, ids] of daysBuckets) {
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batchIds = ids.slice(i, i + BATCH_SIZE);
      await supabase
        .from('service_connections')
        .update({ total_days_to_complete: days })
        .in('id', batchIds);
    }
  }

  // 2. Process new upload records: batch inserts for new, batch updates for existing
  const newInserts: Record<string, unknown>[] = [];
  const existingUpdates: { id: string; updates: Record<string, unknown> }[] = [];

  for (const rec of newRecords) {
    const key = matchKey(rec.customer_reference, rec.service_order_number);
    const existingRow = existingMap.get(key);

    if (!existingRow) {
      // New order — collect for batch insert
      const legacy = isLegacy(rec.application_date);
      const stageHistory: StageHistoryEntry[] = rec.pipeline_stage
        ? [{ stage: rec.pipeline_stage, entered: dataAsOf, exited: null, days: null }]
        : [];
      const track = classifyTrack(rec.pipeline_stage, rec.service_order_type, []);

      newInserts.push({
        customer_reference: rec.customer_reference,
        service_order_number: rec.service_order_number,
        first_name: rec.first_name,
        last_name: rec.last_name,
        telephone: rec.telephone,
        region: rec.region,
        district: rec.district,
        village_ward: rec.village_ward,
        street: rec.street,
        lot: rec.lot,
        account_type: rec.account_type,
        service_order_type: rec.service_order_type,
        division_code: rec.division_code,
        cycle: rec.cycle,
        application_date: rec.application_date || null,
        track,
        status: legacy ? 'legacy_excluded' : 'open',
        current_stage: rec.pipeline_stage,
        stage_history: stageHistory,
        first_seen_date: dataAsOf,
        last_seen_date: dataAsOf,
        is_legacy: legacy,
        raw_data: rec.raw_data,
        _is_legacy: legacy, // temp flag for counting
      });
    } else {
      // Existing order — collect for individual update (stage history varies per row)
      const updates: Record<string, unknown> = {
        last_seen_date: dataAsOf,
        raw_data: rec.raw_data,
        region: rec.region,
        district: rec.district,
        village_ward: rec.village_ward,
        updated_at: new Date().toISOString(),
      };

      // Check for stage change
      const oldStage = existingRow.current_stage;
      const newStage = rec.pipeline_stage;

      if (newStage && newStage !== oldStage) {
        const history: StageHistoryEntry[] = Array.isArray(existingRow.stage_history)
          ? [...existingRow.stage_history]
          : [];

        // Close out the old stage
        if (history.length > 0 && !history[history.length - 1].exited) {
          const lastEntry = history[history.length - 1];
          lastEntry.exited = dataAsOf;
          lastEntry.days = daysBetween(lastEntry.entered, dataAsOf);
        }

        // Add new stage entry
        history.push({ stage: newStage, entered: dataAsOf, exited: null, days: null });

        updates.current_stage = newStage;
        updates.stage_history = history;
        updates.track = classifyTrack(newStage, rec.service_order_type, history);
      }

      existingUpdates.push({ id: existingRow.id, updates });
    }
  }

  // Batch insert new orders
  for (let i = 0; i < newInserts.length; i += BATCH_SIZE) {
    const batch = newInserts.slice(i, i + BATCH_SIZE).map(row => {
      const { _is_legacy, ...rest } = row;
      return rest;
    });

    const { error: insertError } = await supabase
      .from('service_connections')
      .insert(batch);

    if (!insertError) {
      // Count legacy vs new
      for (const row of newInserts.slice(i, i + BATCH_SIZE)) {
        if (row._is_legacy) {
          result.legacyExcluded++;
        } else {
          result.newOrders++;
        }
      }
    }
  }

  // Batch updates for existing orders — group those with identical update payloads
  // For rows with no stage change, we can batch them (same fields being set)
  const simpleUpdates: string[] = []; // IDs with no stage change
  const complexUpdates: typeof existingUpdates = []; // IDs with stage change (unique per row)

  const simpleUpdatePayload: Record<string, unknown> = {
    last_seen_date: dataAsOf,
    updated_at: new Date().toISOString(),
  };

  for (const { id, updates } of existingUpdates) {
    if (updates.current_stage !== undefined) {
      // Stage changed — must update individually (stage_history is unique per row)
      complexUpdates.push({ id, updates });
    } else {
      simpleUpdates.push(id);
    }
  }

  // Batch simple updates
  for (let i = 0; i < simpleUpdates.length; i += BATCH_SIZE) {
    const batchIds = simpleUpdates.slice(i, i + BATCH_SIZE);
    const { error: updateError } = await supabase
      .from('service_connections')
      .update(simpleUpdatePayload)
      .in('id', batchIds);

    if (!updateError) {
      result.updated += batchIds.length;
      result.stillOpen += batchIds.length;
    }
  }

  // Individual complex updates (stage changes — can't batch due to unique stage_history)
  // Run in parallel batches to speed up
  for (let i = 0; i < complexUpdates.length; i += BATCH_SIZE) {
    const batch = complexUpdates.slice(i, i + BATCH_SIZE);
    const promises = batch.map(({ id, updates }) =>
      supabase.from('service_connections').update(updates).eq('id', id)
    );
    const results = await Promise.all(promises);
    for (const r of results) {
      if (!r.error) {
        result.updated++;
        result.stillOpen++;
      }
    }
  }

  // 3. Link related service orders (Track B dual-SO) — scoped to this upload's customers
  const uploadedRefs = new Set<string>();
  for (const rec of newRecords) {
    const ref = (rec.customer_reference || '').trim().toUpperCase();
    if (ref) uploadedRefs.add(ref);
  }
  if (uploadedRefs.size > 0) {
    await linkRelatedOrders(supabase, uploadedRefs);
  }

  return result;
}

/**
 * Scan for same customer_reference with multiple open SOs in different stages.
 * Link them via linked_so_number for end-to-end tracking.
 * Scoped to only the provided customer references for performance.
 */
async function linkRelatedOrders(
  supabase: ReturnType<typeof getSupabase>,
  customerRefs: Set<string>
) {
  const { data: openOrders, error } = await supabase
    .from('service_connections')
    .select('id, customer_reference, service_order_number, current_stage')
    .eq('status', 'open')
    .not('customer_reference', 'is', null)
    .limit(10000);

  if (error || !openOrders) return;

  // Group by customer_reference — only for refs in this upload
  const byRef = new Map<string, typeof openOrders>();
  for (const order of openOrders) {
    const ref = (order.customer_reference || '').trim().toUpperCase();
    if (!ref || !customerRefs.has(ref)) continue;
    if (!byRef.has(ref)) byRef.set(ref, []);
    byRef.get(ref)!.push(order);
  }

  // Collect all link updates then batch them
  const linkUpdates: { id: string; linked_so_number: string }[] = [];

  for (const [, orders] of byRef) {
    if (orders.length < 2) continue;

    const capitalOrders = orders.filter(o => {
      const s = (o.current_stage || '').toLowerCase();
      return s.includes('design') || s.includes('execution');
    });
    const meterOrders = orders.filter(o => {
      const s = (o.current_stage || '').toLowerCase();
      return s.includes('meter');
    });

    for (const cap of capitalOrders) {
      for (const met of meterOrders) {
        if (cap.service_order_number && met.service_order_number) {
          linkUpdates.push({ id: cap.id, linked_so_number: met.service_order_number });
          linkUpdates.push({ id: met.id, linked_so_number: cap.service_order_number });
        }
      }
    }
  }

  // Execute link updates in parallel batches
  for (let i = 0; i < linkUpdates.length; i += BATCH_SIZE) {
    const batch = linkUpdates.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(({ id, linked_so_number }) =>
        supabase.from('service_connections').update({ linked_so_number }).eq('id', id)
      )
    );
  }
}
