// GPL Service Connection Metrics Engine
// Computes statistical metrics for a set of records and their stage SLA target.

import type {
  Track, Stage, Category,
  GPLOutstandingRecord, GPLCompletedRecord,
  GPLMetrics, AgeingBucket, StaffMetric,
} from './types';
import { SLA_TARGETS, AGEING_BUCKETS } from './types';

// ── Statistical Helpers ─────────────────────────────────────────────────────

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function mode(values: number[]): number | null {
  if (values.length === 0) return null;
  const freq = new Map<number, number>();
  for (const v of values) {
    freq.set(v, (freq.get(v) || 0) + 1);
  }
  let maxFreq = 0;
  let modeVal = values[0];
  for (const [val, count] of freq) {
    if (count > maxFreq) {
      maxFreq = count;
      modeVal = val;
    }
  }
  return modeVal;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function trimmedMean(values: number[]): number | null {
  if (values.length < 4) return mean(values);
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25)!;
  const q3 = percentile(sorted, 75)!;
  const iqr = q3 - q1;
  const upperFence = q3 + 1.5 * iqr;
  const filtered = sorted.filter(v => v <= upperFence);
  return filtered.length > 0 ? mean(filtered) : mean(values);
}

function round2(v: number | null): number | null {
  if (v === null) return null;
  return Math.round(v * 100) / 100;
}

// ── Ageing Bucket Computation ───────────────────────────────────────────────

function computeAgeingBuckets(
  days: number[],
  bucketDefs: [string, number, number | null][],
): AgeingBucket[] {
  const total = days.length || 1;
  return bucketDefs.map(([label, min, max]) => {
    const count = days.filter(d => d >= min && (max === null || d <= max)).length;
    return {
      label,
      min,
      max,
      count,
      pct: Math.round((count / total) * 100 * 10) / 10,
    };
  });
}

// ── Staff Performance ───────────────────────────────────────────────────────

function computeStaffBreakdown(records: GPLCompletedRecord[]): StaffMetric[] {
  const staffMap = new Map<string, number[]>();
  for (const r of records) {
    if (!r.created_by || r.is_data_quality_error) continue;
    const days = r.days_taken_calculated ?? r.days_taken;
    if (days === null || days < 0) continue;
    const key = r.created_by.trim();
    if (!staffMap.has(key)) staffMap.set(key, []);
    staffMap.get(key)!.push(days);
  }

  return Array.from(staffMap.entries())
    .map(([name, days]) => ({
      name,
      count: days.length,
      mean: round2(mean(days)) ?? 0,
      median: median(days) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
}

// ── Main Metrics Computation ────────────────────────────────────────────────

export function computeOutstandingMetrics(
  records: GPLOutstandingRecord[],
  track: Track,
  stage: Stage,
): GPLMetrics {
  const slaKey = `${track}:${stage}`;
  const slaTarget = SLA_TARGETS[slaKey] ?? 30;
  const bucketDefs = AGEING_BUCKETS[slaKey] || AGEING_BUCKETS['B:execution'];

  // Use reported days_elapsed (prefer it), fall back to calculated
  const daysValues = records
    .map(r => r.days_elapsed ?? r.days_elapsed_calculated)
    .filter((d): d is number => d !== null && d >= 0);

  const sorted = [...daysValues].sort((a, b) => a - b);
  const withinSla = daysValues.filter(d => d <= slaTarget).length;

  return {
    track,
    stage,
    category: 'outstanding',
    total_count: records.length,
    valid_count: daysValues.length,
    error_count: records.length - daysValues.length,
    sla_target_days: slaTarget,
    within_sla_count: withinSla,
    sla_compliance_pct: daysValues.length > 0
      ? round2((withinSla / daysValues.length) * 100)!
      : 0,
    mean_days: round2(mean(daysValues)),
    median_days: round2(median(daysValues)),
    trimmed_mean_days: round2(trimmedMean(daysValues)),
    mode_days: mode(daysValues) !== null ? Math.round(mode(daysValues)!) : null,
    std_dev: round2(stdDev(daysValues)),
    min_days: sorted.length > 0 ? sorted[0] : null,
    max_days: sorted.length > 0 ? sorted[sorted.length - 1] : null,
    q1: round2(percentile(sorted, 25)),
    q3: round2(percentile(sorted, 75)),
    p90: round2(percentile(sorted, 90)),
    p95: round2(percentile(sorted, 95)),
    ageing_buckets: computeAgeingBuckets(daysValues, bucketDefs),
    staff_breakdown: null,
  };
}

export function computeCompletedMetrics(
  records: GPLCompletedRecord[],
  track: Track,
  stage: Stage,
): GPLMetrics {
  const slaKey = `${track}:${stage}`;
  const slaTarget = SLA_TARGETS[slaKey] ?? 30;
  const bucketDefs = AGEING_BUCKETS[slaKey] || AGEING_BUCKETS['B:execution'];

  const validRecords = records.filter(r => !r.is_data_quality_error);
  const errorCount = records.filter(r => r.is_data_quality_error).length;

  // Use calculated days if available, fall back to reported
  const daysValues = validRecords
    .map(r => r.days_taken_calculated ?? r.days_taken)
    .filter((d): d is number => d !== null && d >= 0);

  const sorted = [...daysValues].sort((a, b) => a - b);
  const withinSla = daysValues.filter(d => d <= slaTarget).length;

  return {
    track,
    stage,
    category: 'completed',
    total_count: records.length,
    valid_count: daysValues.length,
    error_count: errorCount,
    sla_target_days: slaTarget,
    within_sla_count: withinSla,
    sla_compliance_pct: daysValues.length > 0
      ? round2((withinSla / daysValues.length) * 100)!
      : 0,
    mean_days: round2(mean(daysValues)),
    median_days: round2(median(daysValues)),
    trimmed_mean_days: round2(trimmedMean(daysValues)),
    mode_days: mode(daysValues) !== null ? Math.round(mode(daysValues)!) : null,
    std_dev: round2(stdDev(daysValues)),
    min_days: sorted.length > 0 ? sorted[0] : null,
    max_days: sorted.length > 0 ? sorted[sorted.length - 1] : null,
    q1: round2(percentile(sorted, 25)),
    q3: round2(percentile(sorted, 75)),
    p90: round2(percentile(sorted, 90)),
    p95: round2(percentile(sorted, 95)),
    ageing_buckets: computeAgeingBuckets(daysValues, bucketDefs),
    staff_breakdown: computeStaffBreakdown(records),
  };
}
