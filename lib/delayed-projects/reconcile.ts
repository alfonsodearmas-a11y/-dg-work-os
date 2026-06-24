import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { snapshotBeforeUpload } from './snapshot-engine';
import type { ParsedDelayedProject } from './upload-parser';
import type { UploadResult, ClearedProjectRef } from './types';

export const SNAPSHOT_CLEAR_THRESHOLD = 0.35;

export interface ExistingRow {
  id: string;
  source_id: number | null;
  project_reference: string;
  status: 'DELAYED' | 'RESOLVED';
  completion_percent: number;
  project_name: string;
  sub_agency: string;
}

export interface ReconcilePlan {
  guardTripped: boolean;
  activeDelayed: number;
  absentCount: number;
  absentFraction: number;
  toInsert: ParsedDelayedProject[];
  toUpdate: { existing: ExistingRow; incoming: ParsedDelayedProject; reopened: boolean }[];
  toResolveIds: string[];
  counts: { newCount: number; updatedCount: number; resolvedCount: number; reopenedCount: number };
}

export function planReconciliation(
  existing: ExistingRow[],
  incoming: ParsedDelayedProject[],
  confirmFullExport: boolean,
): ReconcilePlan {
  // Build lookup maps over existing rows
  const bySourceId = new Map<number, ExistingRow>();
  const byRef = new Map<string, ExistingRow>();
  for (const row of existing) {
    if (row.source_id !== null) bySourceId.set(row.source_id, row);
    byRef.set(row.project_reference.trim(), row);
  }

  // Build sets of what the upload covers (for absent computation)
  const incomingSourceIds = new Set<number>();
  const incomingRefs = new Set<string>();
  for (const row of incoming) {
    if (row.source_id !== null) incomingSourceIds.add(row.source_id);
    incomingRefs.add(row.project_reference.trim());
  }

  // Classify each incoming row as update or insert
  const toInsert: ParsedDelayedProject[] = [];
  const toUpdate: ReconcilePlan['toUpdate'] = [];
  const matchedExistingIds = new Set<string>();

  for (const row of incoming) {
    let matched: ExistingRow | undefined;
    if (row.source_id !== null) {
      matched = bySourceId.get(row.source_id);
    }
    if (!matched) {
      matched = byRef.get(row.project_reference.trim());
    }

    if (matched) {
      // Defensive dedup: export guarantees unique source_id/ref, but if two
      // incoming rows somehow match the same existing row, skip the duplicate.
      if (matchedExistingIds.has(matched.id)) continue;
      matchedExistingIds.add(matched.id);
      toUpdate.push({
        existing: matched,
        incoming: row,
        reopened: matched.status === 'RESOLVED',
      });
    } else {
      toInsert.push(row);
    }
  }

  // Guard + absent set: only DELAYED existing rows can be cleared
  const delayedRows = existing.filter((r) => r.status === 'DELAYED');
  const activeDelayed = delayedRows.length;

  const absentDelayedRows = delayedRows.filter((r) => {
    const inBySid = r.source_id !== null && incomingSourceIds.has(r.source_id);
    const inByRef = incomingRefs.has(r.project_reference.trim());
    return !inBySid && !inByRef;
  });
  const absentCount = absentDelayedRows.length;
  const absentFraction = activeDelayed > 0 ? absentCount / activeDelayed : 0;

  const guardTripped =
    activeDelayed > 0 && absentFraction > SNAPSHOT_CLEAR_THRESHOLD && !confirmFullExport;

  const toResolveIds = guardTripped ? [] : absentDelayedRows.map((r) => r.id);

  const newCount = toInsert.length;
  const updatedCount = toUpdate.filter((u) => u.existing.status === 'DELAYED').length;
  const reopenedCount = toUpdate.filter((u) => u.reopened).length;
  const resolvedCount = toResolveIds.length;

  return {
    guardTripped,
    activeDelayed,
    absentCount,
    absentFraction,
    toInsert,
    toUpdate,
    toResolveIds,
    counts: { newCount, updatedCount, resolvedCount, reopenedCount },
  };
}

// ── Executor ─────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 50;

/**
 * Applies a reconciliation plan to the database.
 *
 * FAILURE-SAFE ordering:
 *   1. Read existing (ALL statuses) → plan → guard check.
 *   2. If guard tripped → return needsConfirmation with ZERO writes (no snapshot, no batch).
 *   3. Else → snapshot → insert batch → apply present rows → resolve absentees → update counts.
 *
 * Only committed operations contribute to the returned counts (never plan.counts).
 */
export async function reconcileUpload(
  rows: ParsedDelayedProject[],
  opts: { fileName?: string; uploadedBy?: string | null; confirmFullExport?: boolean },
): Promise<UploadResult> {
  // ── Step 1: Read existing (ALL statuses) ────────────────────────────────────
  const { data: existingData, error: fetchError } = await supabaseAdmin
    .from('delayed_projects')
    .select('id, source_id, project_reference, status, completion_percent, project_name, sub_agency, contract_value, created_at');

  if (fetchError) {
    logger.error({ error: fetchError }, 'reconcileUpload: failed to fetch existing rows');
    throw new Error('Failed to fetch existing delayed projects');
  }

  // Full row map (id → row) needed for building ClearedProjectRef
  const fullById = new Map<string, {
    id: string;
    source_id: number | null;
    project_reference: string;
    status: string;
    completion_percent: number;
    project_name: string;
    sub_agency: string;
    contract_value: number;
    created_at: string | null;
  }>();

  // Subset used by planner (ExistingRow)
  const existing: ExistingRow[] = [];

  for (const r of existingData ?? []) {
    const row = {
      id: r.id as string,
      source_id: r.source_id as number | null,
      project_reference: r.project_reference as string,
      status: r.status as string,
      completion_percent: Number(r.completion_percent),
      project_name: r.project_name as string,
      sub_agency: r.sub_agency as string,
      contract_value: Number(r.contract_value),
      created_at: r.created_at as string | null,
    };
    fullById.set(row.id, row);
    existing.push({
      id: row.id,
      source_id: row.source_id,
      project_reference: row.project_reference,
      status: row.status as 'DELAYED' | 'RESOLVED',
      completion_percent: row.completion_percent,
      project_name: row.project_name,
      sub_agency: row.sub_agency,
    });
  }

  // ── Step 2: Plan ─────────────────────────────────────────────────────────────
  const plan = planReconciliation(existing, rows, !!opts.confirmFullExport);

  // ── Step 3: Guard check ───────────────────────────────────────────────────────
  if (plan.guardTripped) {
    return {
      new_count: 0,
      updated_count: 0,
      resolved_count: 0,
      reopened_count: 0,
      cleared: [],
      reopened: [],
      cleared_analytics: { count: 0, total_contract_value: 0, avg_days_to_clear: null },
      partial: false,
      // Guard trip indicator
      needsConfirmation: true,
      activeDelayed: plan.activeDelayed,
      absentCount: plan.absentCount,
      absentFraction: plan.absentFraction,
      threshold: SNAPSHOT_CLEAR_THRESHOLD,
    };
  }

  // ── Step 4: Snapshot (DELAYED-only — guard passed) ───────────────────────────
  await snapshotBeforeUpload();

  // ── Step 5: Insert batch record ───────────────────────────────────────────────
  const { data: batchData, error: batchError } = await supabaseAdmin
    .from('upload_batches')
    .insert({
      file_name: opts.fileName ?? null,
      uploaded_by: opts.uploadedBy ?? null,
      row_count: rows.length,
    })
    .select('id, file_name')
    .single();

  if (batchError || !batchData) {
    logger.error({ error: batchError }, 'reconcileUpload: failed to insert upload_batch');
    throw new Error('Failed to create upload batch record');
  }

  const batchId = batchData.id as string;
  const batchFile = batchData.file_name as string | null;
  const nowIso = new Date().toISOString();

  // ── Step 6: Apply present rows ────────────────────────────────────────────────
  let committedNew = 0;
  let committedUpdated = 0;
  let committedReopened = 0;
  const committedReopenedList: { project_name: string; sub_agency: string }[] = [];

  // Track reopen status per id for attribution
  const updateReopenMap = new Map<string, boolean>();
  for (const u of plan.toUpdate) {
    updateReopenMap.set(u.existing.id, u.reopened);
  }

  // 6a: Inserts
  for (let i = 0; i < plan.toInsert.length; i += CHUNK_SIZE) {
    const chunk = plan.toInsert.slice(i, i + CHUNK_SIZE);
    const insertRows = chunk.map((r) => ({
      project_reference: r.project_reference,
      executing_agency: r.executing_agency,
      sub_agency: r.sub_agency,
      project_name: r.project_name,
      region: r.region,
      tender_board_type: r.tender_board_type,
      contract_value: r.contract_value,
      contractors: r.contractors,
      project_end_date: r.project_end_date,
      completion_percent: r.completion_percent,
      has_images: r.has_images,
      status: 'DELAYED' as const,
      source_id: r.source_id,
      last_seen_batch_id: batchId,
    }));

    const { error: insertErr } = await supabaseAdmin.from('delayed_projects').insert(insertRows);

    if (insertErr) {
      logger.error({ error: insertErr, chunk: i }, 'reconcileUpload: bulk insert chunk failed — falling back one-by-one');
      for (const row of insertRows) {
        const { error: singleErr } = await supabaseAdmin.from('delayed_projects').insert(row);
        if (singleErr) {
          logger.error({ error: singleErr, ref: row.project_reference }, 'reconcileUpload: single insert failed');
        } else {
          committedNew++;
        }
      }
    } else {
      committedNew += chunk.length;
    }
  }

  // 6b: Updates (existing rows that are in the upload — including reopens)
  for (let i = 0; i < plan.toUpdate.length; i += CHUNK_SIZE) {
    const chunk = plan.toUpdate.slice(i, i + CHUNK_SIZE);
    const upsertRows = chunk.map((u) => ({
      id: u.existing.id,
      project_reference: u.incoming.project_reference,
      executing_agency: u.incoming.executing_agency,
      sub_agency: u.incoming.sub_agency,
      project_name: u.incoming.project_name,
      region: u.incoming.region,
      tender_board_type: u.incoming.tender_board_type,
      contract_value: u.incoming.contract_value,
      contractors: u.incoming.contractors,
      project_end_date: u.incoming.project_end_date,
      completion_percent: u.incoming.completion_percent,
      has_images: u.incoming.has_images,
      status: 'DELAYED' as const,
      source_id: u.incoming.source_id,
      last_seen_batch_id: batchId,
      ...(u.reopened ? { reopened_at: nowIso } : {}),
      // Do NOT set resolved_at — preserve history
    }));

    const { error: upsertErr } = await supabaseAdmin
      .from('delayed_projects')
      .upsert(upsertRows, { onConflict: 'id' });

    if (upsertErr) {
      logger.error({ error: upsertErr, chunk: i }, 'reconcileUpload: bulk update chunk failed — falling back one-by-one');
      for (const row of upsertRows) {
        const { error: singleErr } = await supabaseAdmin
          .from('delayed_projects')
          .upsert(row, { onConflict: 'id' });
        if (singleErr) {
          logger.error({ error: singleErr, id: row.id }, 'reconcileUpload: single update failed');
        } else {
          const reopened = updateReopenMap.get(row.id) ?? false;
          if (reopened) {
            committedReopened++;
            // Find the plan entry to get project_name / sub_agency
            const planEntry = plan.toUpdate.find((u) => u.existing.id === row.id);
            if (planEntry) {
              committedReopenedList.push({ project_name: planEntry.incoming.project_name, sub_agency: planEntry.incoming.sub_agency });
            }
          } else {
            committedUpdated++;
          }
        }
      }
    } else {
      for (const u of chunk) {
        if (u.reopened) {
          committedReopened++;
          committedReopenedList.push({ project_name: u.incoming.project_name, sub_agency: u.incoming.sub_agency });
        } else {
          committedUpdated++;
        }
      }
    }
  }

  // ── Step 7: Resolve absentees LAST ───────────────────────────────────────────
  let committedResolved = 0;
  const clearedRefs: ClearedProjectRef[] = [];

  for (let i = 0; i < plan.toResolveIds.length; i += CHUNK_SIZE) {
    const chunkIds = plan.toResolveIds.slice(i, i + CHUNK_SIZE);
    const { data: resolvedData, error: resolveErr } = await supabaseAdmin
      .from('delayed_projects')
      .update({
        status: 'RESOLVED',
        resolved_at: nowIso,
        resolved_by_batch_id: batchId,
      })
      .in('id', chunkIds)
      .select('id');

    if (resolveErr) {
      logger.error({ error: resolveErr, chunk: i }, 'reconcileUpload: bulk resolve chunk failed — falling back one-by-one');
      for (const id of chunkIds) {
        const { data: singleData, error: singleErr } = await supabaseAdmin
          .from('delayed_projects')
          .update({
            status: 'RESOLVED',
            resolved_at: nowIso,
            resolved_by_batch_id: batchId,
          })
          .eq('id', id)
          .select('id');
        if (singleErr) {
          logger.error({ error: singleErr, id }, 'reconcileUpload: single resolve failed');
        } else if (singleData?.length) {
          committedResolved++;
          const full = fullById.get(id);
          if (full) {
            clearedRefs.push({
              source_id: full.source_id,
              project_reference: full.project_reference,
              project_name: full.project_name,
              sub_agency: full.sub_agency,
              completion_percent: Number(full.completion_percent),
              contract_value: Number(full.contract_value),
              resolved_at: nowIso,
              created_at: full.created_at ?? null,
              resolved_by_file: batchFile ?? undefined,
            });
          }
        }
      }
    } else {
      for (const row of resolvedData ?? []) {
        committedResolved++;
        const full = fullById.get(row.id as string);
        if (full) {
          clearedRefs.push({
            source_id: full.source_id,
            project_reference: full.project_reference,
            project_name: full.project_name,
            sub_agency: full.sub_agency,
            completion_percent: Number(full.completion_percent),
            contract_value: Number(full.contract_value),
            resolved_at: nowIso,
            created_at: full.created_at ?? null,
            resolved_by_file: batchFile ?? undefined,
          });
        }
      }
    }
  }

  // ── Step 8: Write committed counts back to upload_batches ─────────────────────
  const { error: updateBatchErr } = await supabaseAdmin
    .from('upload_batches')
    .update({
      new_count: committedNew,
      updated_count: committedUpdated,
      resolved_count: committedResolved,
      reopened_count: committedReopened,
    })
    .eq('id', batchId);

  if (updateBatchErr) {
    logger.error({ error: updateBatchErr, batchId }, 'reconcileUpload: failed to update batch counts');
  }

  // ── Step 9: Build result ──────────────────────────────────────────────────────

  // cleared_analytics
  const totalContractValue = clearedRefs.reduce((sum, c) => sum + c.contract_value, 0);
  const daysToClears = clearedRefs
    .filter((c) => c.created_at)
    .map((c) => (new Date(c.resolved_at).getTime() - new Date(c.created_at!).getTime()) / 86400000);
  const avgDaysToClear =
    daysToClears.length > 0
      ? Math.round((daysToClears.reduce((a, b) => a + b, 0) / daysToClears.length) * 10) / 10
      : null;

  const planned = plan.toInsert.length + plan.toUpdate.length + plan.toResolveIds.length;
  const applied = committedNew + committedUpdated + committedReopened + committedResolved;

  logger.info(
    { batchId, committedNew, committedUpdated, committedReopened, committedResolved, partial: applied < planned },
    'reconcileUpload: complete',
  );

  return {
    new_count: committedNew,
    updated_count: committedUpdated,
    resolved_count: committedResolved,
    reopened_count: committedReopened,
    cleared: clearedRefs,
    reopened: committedReopenedList,
    cleared_analytics: {
      count: clearedRefs.length,
      total_contract_value: totalContractValue,
      avg_days_to_clear: avgDaysToClear,
    },
    partial: applied < planned,
    applied,
    planned,
  };
}
