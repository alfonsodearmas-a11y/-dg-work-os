// Service Connection Diff Engine
// Compares new upload against existing open service_connections to detect completions.

import { createClient } from '@supabase/supabase-js';
import type { DiffResult, StageHistoryEntry } from './service-connection-types';
import type { PendingRecord } from './pending-applications-types';
import { LEGACY_CUTOFF } from './service-connection-types';
import { classifyTrack } from './service-connection-track';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
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

  // Fetch all existing open connections
  const { data: existing, error } = await supabase
    .from('service_connections')
    .select('*')
    .eq('status', 'open');

  if (error) {
    console.error('[service-connection-diff] Error fetching existing:', error.message);
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

  // 1. Detect disappeared (completed) orders
  for (const [key, row] of existingMap) {
    if (!newKeys.has(key)) {
      // Try fallback: match by customer_reference if SO# mismatch
      const ref = (row.customer_reference || '').trim().toUpperCase();
      const soNum = (row.service_order_number || '').trim().toUpperCase();
      let foundFallback = false;

      if (ref && soNum) {
        // Check if same customer_ref exists in new upload with different/null SO#
        for (const [nk, nr] of newByKey) {
          const nRef = (nr.customer_reference || '').trim().toUpperCase();
          const nSo = (nr.service_order_number || '').trim().toUpperCase();
          if (nRef === ref && nSo !== soNum && !nSo) {
            foundFallback = true;
            break;
          }
        }
      }

      if (foundFallback) continue;

      // Mark as completed
      const totalDays = row.application_date
        ? daysBetween(row.application_date, dataAsOf)
        : null;

      const { error: updateError } = await supabase
        .from('service_connections')
        .update({
          status: 'completed',
          disappeared_date: dataAsOf,
          energisation_date: dataAsOf,
          total_days_to_complete: totalDays,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (!updateError) {
        result.disappeared++;
        result.completedIds.push(row.id);
      }
    }
  }

  // 2. Process new upload records: insert new, update existing
  for (const rec of newRecords) {
    const key = matchKey(rec.customer_reference, rec.service_order_number);
    const existingRow = existingMap.get(key);

    if (!existingRow) {
      // New order — insert
      const legacy = isLegacy(rec.application_date);
      const stageHistory: StageHistoryEntry[] = rec.pipeline_stage
        ? [{ stage: rec.pipeline_stage, entered: dataAsOf, exited: null, days: null }]
        : [];
      const track = classifyTrack(rec.pipeline_stage, rec.service_order_type, []);

      const { error: insertError } = await supabase
        .from('service_connections')
        .insert({
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
        });

      if (!insertError) {
        if (legacy) {
          result.legacyExcluded++;
        } else {
          result.newOrders++;
        }
      }
    } else {
      // Existing order — update
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

      const { error: updateError } = await supabase
        .from('service_connections')
        .update(updates)
        .eq('id', existingRow.id);

      if (!updateError) {
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
    .not('customer_reference', 'is', null);

  if (error || !openOrders) return;

  // Group by customer_reference — only for refs in this upload
  const byRef = new Map<string, typeof openOrders>();
  for (const order of openOrders) {
    const ref = (order.customer_reference || '').trim().toUpperCase();
    if (!ref || !customerRefs.has(ref)) continue;
    if (!byRef.has(ref)) byRef.set(ref, []);
    byRef.get(ref)!.push(order);
  }

  // Find pairs: one in Design/Execution, another in Metering
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
          await supabase
            .from('service_connections')
            .update({ linked_so_number: met.service_order_number })
            .eq('id', cap.id);
          await supabase
            .from('service_connections')
            .update({ linked_so_number: cap.service_order_number })
            .eq('id', met.id);
        }
      }
    }
  }
}
