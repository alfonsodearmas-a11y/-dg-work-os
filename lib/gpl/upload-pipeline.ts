// GPL Upload Processing Pipeline
// Orchestrates: parse -> dedup -> metrics -> db upsert -> outlier update

import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { parseGPLExcel } from './parser';
import { computeOutstandingMetrics, computeCompletedMetrics } from './metrics';
import type {
  Track, Stage,
  GPLParseResult, GPLParsedSheet, GPLDataWarning,
  GPLOutstandingRecord, GPLCompletedRecord, GPLMetrics,
} from './types';

// ── Cross-Stage Duplicate Detection ─────────────────────────────────────────

function detectCrossStageDuplicates(sheets: GPLParsedSheet[]): GPLDataWarning[] {
  const warnings: GPLDataWarning[] = [];
  const outstandingSheets = sheets.filter(s => s.category === 'outstanding');

  // Map account_number -> stages where it appears
  const accountStages = new Map<string, { track: Track; stage: Stage; sheetName: string }[]>();

  for (const sheet of outstandingSheets) {
    for (const r of sheet.records as GPLOutstandingRecord[]) {
      if (!r.account_number) continue;
      if (!accountStages.has(r.account_number)) accountStages.set(r.account_number, []);
      accountStages.get(r.account_number)!.push({
        track: sheet.track,
        stage: sheet.stage,
        sheetName: sheet.sheetName,
      });
    }
  }

  for (const [acct, stages] of accountStages) {
    if (stages.length > 1) {
      const stageNames = stages.map(s => `${s.track}:${s.stage} (${s.sheetName})`).join(', ');
      warnings.push({
        type: 'duplicate_cross_stage',
        severity: 'warning',
        message: `Account ${acct} appears in multiple stages: ${stageNames}`,
        details: { accountNumber: acct, stages },
      });
    }
  }

  return warnings;
}

// ── Database Operations ─────────────────────────────────────────────────────

function formatDateISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

async function upsertSnapshot(
  parseResult: GPLParseResult,
  allWarnings: GPLDataWarning[],
  userId: string | null,
): Promise<string> {
  const snapshotDateStr = formatDateISO(parseResult.snapshotDate);

  // Delete existing snapshot for this date (upsert pattern)
  await supabaseAdmin
    .from('gpl_snapshots')
    .delete()
    .eq('snapshot_date', snapshotDateStr);

  // Count records per category
  let trackAOutstanding = 0;
  let trackACompleted = 0;
  let trackBDesignOutstanding = 0;
  let trackBExecutionOutstanding = 0;
  let trackBDesignCompleted = 0;
  let trackBExecutionCompleted = 0;

  for (const sheet of parseResult.sheets) {
    const count = sheet.recordCount;
    if (sheet.track === 'A' && sheet.category === 'outstanding') trackAOutstanding += count;
    else if (sheet.track === 'A' && sheet.category === 'completed') trackACompleted += count;
    else if (sheet.track === 'B' && sheet.stage === 'design' && sheet.category === 'outstanding') trackBDesignOutstanding += count;
    else if (sheet.track === 'B' && sheet.stage === 'execution' && sheet.category === 'outstanding') trackBExecutionOutstanding += count;
    else if (sheet.track === 'B' && sheet.stage === 'design' && sheet.category === 'completed') trackBDesignCompleted += count;
    else if (sheet.track === 'B' && sheet.stage === 'execution' && sheet.category === 'completed') trackBExecutionCompleted += count;
  }

  const { data, error } = await supabaseAdmin
    .from('gpl_snapshots')
    .insert({
      snapshot_date: snapshotDateStr,
      file_name: parseResult.fileName,
      track_a_outstanding: trackAOutstanding,
      track_a_completed: trackACompleted,
      track_b_design_outstanding: trackBDesignOutstanding,
      track_b_execution_outstanding: trackBExecutionOutstanding,
      track_b_design_completed: trackBDesignCompleted,
      track_b_execution_completed: trackBExecutionCompleted,
      data_quality_warnings: allWarnings,
      warning_count: allWarnings.length,
      user_id: userId,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to insert snapshot: ${error.message}`);
  return data.id;
}

async function bulkInsertOutstanding(
  snapshotId: string,
  sheets: GPLParsedSheet[],
): Promise<void> {
  const outstandingSheets = sheets.filter(s => s.category === 'outstanding');
  const batchSize = 100;

  for (const sheet of outstandingSheets) {
    const records = sheet.records as GPLOutstandingRecord[];
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize).map(r => ({
        snapshot_id: snapshotId,
        track: sheet.track,
        stage: sheet.stage,
        row_number: r.row_number,
        customer_number: r.customer_number,
        account_number: r.account_number,
        customer_name: r.customer_name,
        service_address: r.service_address,
        town_city: r.town_city,
        account_status: r.account_status,
        cycle: r.cycle,
        account_type: r.account_type,
        division_code: r.division_code,
        service_order_number: r.service_order_number,
        service_type: r.service_type,
        date_created: r.date_created?.toISOString() ?? null,
        current_date_ref: r.current_date_ref ? formatDateISO(r.current_date_ref) : null,
        days_elapsed: r.days_elapsed,
        days_elapsed_calculated: r.days_elapsed_calculated,
      }));

      const { error } = await supabaseAdmin
        .from('gpl_outstanding')
        .insert(batch);

      if (error) {
        logger.error({ err: error, batch: i }, 'gpl-upload: outstanding insert error');
      }
    }
  }
}

async function bulkInsertCompleted(
  snapshotId: string,
  sheets: GPLParsedSheet[],
): Promise<void> {
  const completedSheets = sheets.filter(s => s.category === 'completed');
  const batchSize = 100;

  for (const sheet of completedSheets) {
    const records = sheet.records as GPLCompletedRecord[];
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize).map(r => ({
        snapshot_id: snapshotId,
        track: sheet.track,
        stage: sheet.stage,
        row_number: r.row_number,
        customer_number: r.customer_number,
        account_number: r.account_number,
        customer_name: r.customer_name,
        service_address: r.service_address,
        town_city: r.town_city,
        account_status: r.account_status,
        cycle: r.cycle,
        account_type: r.account_type,
        service_order_number: r.service_order_number,
        service_type: r.service_type,
        date_created: r.date_created?.toISOString() ?? null,
        date_completed: r.date_completed ? formatDateISO(r.date_completed) : null,
        created_by: r.created_by,
        days_taken: r.days_taken,
        days_taken_calculated: r.days_taken_calculated,
        is_data_quality_error: r.is_data_quality_error,
        data_quality_note: r.data_quality_note,
      }));

      const { error } = await supabaseAdmin
        .from('gpl_completed')
        .insert(batch);

      if (error) {
        logger.error({ err: error, batch: i }, 'gpl-upload: completed insert error');
      }
    }
  }
}

async function insertMetrics(
  snapshotId: string,
  allMetrics: GPLMetrics[],
): Promise<void> {
  const rows = allMetrics.map(m => ({
    snapshot_id: snapshotId,
    track: m.track,
    stage: m.stage,
    category: m.category,
    total_count: m.total_count,
    valid_count: m.valid_count,
    error_count: m.error_count,
    sla_target_days: m.sla_target_days,
    within_sla_count: m.within_sla_count,
    sla_compliance_pct: m.sla_compliance_pct,
    mean_days: m.mean_days,
    median_days: m.median_days,
    trimmed_mean_days: m.trimmed_mean_days,
    mode_days: m.mode_days,
    std_dev: m.std_dev,
    min_days: m.min_days,
    max_days: m.max_days,
    q1: m.q1,
    q3: m.q3,
    p90: m.p90,
    p95: m.p95,
    ageing_buckets: m.ageing_buckets,
    staff_breakdown: m.staff_breakdown,
  }));

  const { error } = await supabaseAdmin
    .from('gpl_snapshot_metrics')
    .insert(rows);

  if (error) {
    logger.error({ err: error }, 'gpl-upload: metrics insert error');
  }
}

// ── Chronic Outlier Watchlist ────────────────────────────────────────────────

async function updateChronicOutliers(
  snapshotId: string,
  snapshotDate: Date,
  sheets: GPLParsedSheet[],
): Promise<void> {
  const outstandingSheets = sheets.filter(s => s.category === 'outstanding');
  const snapshotDateStr = formatDateISO(snapshotDate);

  // Get previous snapshot
  const { data: prevSnapshots } = await supabaseAdmin
    .from('gpl_snapshots')
    .select('id')
    .lt('snapshot_date', snapshotDateStr)
    .order('snapshot_date', { ascending: false })
    .limit(1);

  const prevSnapshotId = prevSnapshots?.[0]?.id ?? null;

  // Build current outstanding set
  const currentOutstanding = new Map<string, {
    accountNumber: string;
    customerName: string | null;
    townCity: string | null;
    track: Track;
    stage: Stage;
    serviceOrderNumber: string | null;
    daysElapsed: number | null;
    dateCreated: Date | null;
  }>();

  for (const sheet of outstandingSheets) {
    for (const r of sheet.records as GPLOutstandingRecord[]) {
      if (!r.account_number) continue;
      const key = `${r.account_number}:${r.service_order_number || ''}`;
      const slaKey = `${sheet.track}:${sheet.stage}`;
      const slaTarget = (await import('./types')).SLA_TARGETS[slaKey] ?? 30;
      const days = r.days_elapsed ?? r.days_elapsed_calculated ?? 0;

      // Only track if over 2x SLA
      if (days > slaTarget * 2) {
        currentOutstanding.set(key, {
          accountNumber: r.account_number,
          customerName: r.customer_name,
          townCity: r.town_city,
          track: sheet.track,
          stage: sheet.stage,
          serviceOrderNumber: r.service_order_number,
          daysElapsed: days,
          dateCreated: r.date_created,
        });
      }
    }
  }

  // Get existing unresolved outliers
  const { data: existingOutliers } = await supabaseAdmin
    .from('gpl_chronic_outliers')
    .select('*')
    .eq('resolved', false);

  const existingMap = new Map<string, { id: string; consecutive_snapshots: number }>();
  if (existingOutliers) {
    for (const o of existingOutliers) {
      const key = `${o.account_number}:${o.service_order_number || ''}`;
      existingMap.set(key, { id: o.id, consecutive_snapshots: o.consecutive_snapshots });
    }
  }

  // Update or create outliers
  for (const [key, record] of currentOutstanding) {
    const existing = existingMap.get(key);
    if (existing) {
      // Update existing outlier
      await supabaseAdmin
        .from('gpl_chronic_outliers')
        .update({
          latest_snapshot_id: snapshotId,
          latest_days_elapsed: record.daysElapsed,
          consecutive_snapshots: existing.consecutive_snapshots + 1,
          customer_name: record.customerName,
          town_city: record.townCity,
        })
        .eq('id', existing.id);

      existingMap.delete(key);
    } else {
      // Create new outlier
      await supabaseAdmin
        .from('gpl_chronic_outliers')
        .upsert({
          account_number: record.accountNumber,
          customer_name: record.customerName,
          town_city: record.townCity,
          track: record.track,
          stage: record.stage,
          service_order_number: record.serviceOrderNumber,
          first_seen_date: snapshotDateStr,
          first_seen_snapshot_id: snapshotId,
          latest_snapshot_id: snapshotId,
          latest_days_elapsed: record.daysElapsed,
          consecutive_snapshots: 1,
          date_created: record.dateCreated?.toISOString() ?? null,
          resolved: false,
        }, { onConflict: 'account_number,service_order_number' });
    }
  }

  // Resolve outliers that are no longer in outstanding
  for (const [, remaining] of existingMap) {
    await supabaseAdmin
      .from('gpl_chronic_outliers')
      .update({
        resolved: true,
        resolved_date: snapshotDateStr,
      })
      .eq('id', remaining.id);
  }
}

// ── Main Pipeline ───────────────────────────────────────────────────────────

export interface UploadResult {
  snapshotId: string;
  snapshotDate: string;
  parseResult: GPLParseResult;
  metrics: GPLMetrics[];
  warnings: GPLDataWarning[];
  counts: {
    trackAOutstanding: number;
    trackACompleted: number;
    trackBDesignOutstanding: number;
    trackBDesignCompleted: number;
    trackBExecutionOutstanding: number;
    trackBExecutionCompleted: number;
  };
}

export async function processGPLUpload(
  buffer: Buffer,
  fileName: string,
  userId: string | null,
): Promise<UploadResult> {
  // 1. Parse
  const parseResult = parseGPLExcel(buffer, fileName);

  // 2. Cross-stage dedup
  const crossDupWarnings = detectCrossStageDuplicates(parseResult.sheets);
  const allWarnings = [...parseResult.warnings, ...crossDupWarnings];

  // 3. Compute metrics for each (track, stage, category)
  const allMetrics: GPLMetrics[] = [];
  for (const sheet of parseResult.sheets) {
    if (sheet.category === 'outstanding') {
      allMetrics.push(computeOutstandingMetrics(
        sheet.records as GPLOutstandingRecord[],
        sheet.track,
        sheet.stage,
      ));
    } else {
      allMetrics.push(computeCompletedMetrics(
        sheet.records as GPLCompletedRecord[],
        sheet.track,
        sheet.stage,
      ));
    }
  }

  // 4. Upsert snapshot
  const snapshotId = await upsertSnapshot(parseResult, allWarnings, userId);

  // 5-6. Bulk insert records
  await Promise.all([
    bulkInsertOutstanding(snapshotId, parseResult.sheets),
    bulkInsertCompleted(snapshotId, parseResult.sheets),
  ]);

  // 7. Insert metrics
  await insertMetrics(snapshotId, allMetrics);

  // 8. Update chronic outliers
  await updateChronicOutliers(snapshotId, parseResult.snapshotDate, parseResult.sheets);

  // Build counts
  const counts = { trackAOutstanding: 0, trackACompleted: 0, trackBDesignOutstanding: 0, trackBDesignCompleted: 0, trackBExecutionOutstanding: 0, trackBExecutionCompleted: 0 };
  for (const sheet of parseResult.sheets) {
    if (sheet.track === 'A' && sheet.category === 'outstanding') counts.trackAOutstanding += sheet.recordCount;
    else if (sheet.track === 'A' && sheet.category === 'completed') counts.trackACompleted += sheet.recordCount;
    else if (sheet.track === 'B' && sheet.stage === 'design' && sheet.category === 'outstanding') counts.trackBDesignOutstanding += sheet.recordCount;
    else if (sheet.track === 'B' && sheet.stage === 'design' && sheet.category === 'completed') counts.trackBDesignCompleted += sheet.recordCount;
    else if (sheet.track === 'B' && sheet.stage === 'execution' && sheet.category === 'outstanding') counts.trackBExecutionOutstanding += sheet.recordCount;
    else if (sheet.track === 'B' && sheet.stage === 'execution' && sheet.category === 'completed') counts.trackBExecutionCompleted += sheet.recordCount;
  }

  return {
    snapshotId,
    snapshotDate: formatDateISO(parseResult.snapshotDate),
    parseResult,
    metrics: allMetrics,
    warnings: allWarnings,
    counts,
  };
}
