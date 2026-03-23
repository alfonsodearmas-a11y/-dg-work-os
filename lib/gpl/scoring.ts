// GPL Grid Health — Scoring Logic
// Pure functions only: no DB calls, no side effects, no fetch.
// All thresholds come from config.ts.

import { GPL_CONFIG } from './config';
import type {
  GplOutage,
  GplFeeder,
  FeederHealth,
  FeederGrade,
  PulseScore,
  TrendDirection,
  MonthSummary,
  MonthSubstationBreakdown,
  MonthCauseBreakdown,
  MonthWorstFeeder,
} from './types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Filter outages to those within the last N days from a reference date */
function outagesInWindow(outages: GplOutage[], days: number, refDate?: Date): GplOutage[] {
  const ref = refDate ?? new Date();
  const cutoff = new Date(ref);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return outages.filter((o) => o.date >= cutoffStr);
}

/** Lookup scoring table: find the highest threshold key <= value */
function lookupScore(table: Record<number, number>, value: number): number {
  const keys = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);

  // For frequency: exact match or clamp to worst
  for (let i = keys.length - 1; i >= 0; i--) {
    if (value <= keys[i]) continue;
    // value exceeds this key — the score at the next key above, or worst
  }

  // Find the bracket the value falls into
  for (let i = keys.length - 1; i >= 0; i--) {
    if (value <= keys[i]) return table[keys[i]];
  }
  // Worse than all thresholds — return lowest score minus penalty
  return Math.max(0, table[keys[keys.length - 1]] - 20);
}

// ── Pulse Score (system-wide) ───────────────────────────────────────────────

export function calculatePulseScore(
  outages: GplOutage[],
  feeders: GplFeeder[],
  days: number = 30
): PulseScore {
  const { weights, targets } = GPL_CONFIG.pulse;
  const recent = outagesInWindow(outages, days);
  const totalCustomers = feeders.reduce((sum, f) => sum + (f.customer_count || 0), 0);

  // Frequency: average outages per day
  const avgPerDay = recent.length / Math.max(days, 1);
  const frequencyRaw = 100 - ((avgPerDay - targets.maxOutagesPerDay) / targets.maxOutagesPerDay) * 50;
  const frequency_score = clamp(Math.round(frequencyRaw), 0, 100);

  // Restoration: average duration in minutes
  const durations = recent
    .map((o) => o.duration_minutes)
    .filter((d): d is number => d != null && d > 0);
  const avgMin = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const restorationRaw = 100 - ((avgMin - targets.maxAvgRestorationMin) / targets.maxAvgRestorationMin) * 50;
  const restoration_score = clamp(Math.round(restorationRaw), 0, 100);

  // Impact: customer-minutes interrupted per 1000 customers
  const totalCMI = recent.reduce((sum, o) => {
    const mins = o.duration_minutes ?? 0;
    const custs = o.customers_affected ?? 0;
    return sum + mins * custs;
  }, 0);
  const cmiPer1000 = totalCustomers > 0 ? (totalCMI / totalCustomers) * 1000 : 0;
  const impactRaw = 100 - ((cmiPer1000 - targets.maxCmiPer1000) / targets.maxCmiPer1000) * 50;
  const impact_score = clamp(Math.round(impactRaw), 0, 100);

  const overall = Math.round(
    frequency_score * weights.frequency +
    restoration_score * weights.restoration +
    impact_score * weights.impact
  );

  return {
    overall,
    frequency_score,
    restoration_score,
    impact_score,
    outage_count_30d: recent.length,
    avg_restoration_min: Math.round(avgMin * 10) / 10,
    cmi_per_1000: Math.round(cmiPer1000),
  };
}

// ── Feeder Grade ────────────────────────────────────────────────────────────

export function calculateFeederGrade(score: number): FeederGrade {
  const grades = GPL_CONFIG.feederGrades;
  if (score >= grades.A.min) return 'A';
  if (score >= grades.B.min) return 'B';
  if (score >= grades.C.min) return 'C';
  if (score >= grades.D.min) return 'D';
  return 'F';
}

// ── Feeder Health ───────────────────────────────────────────────────────────

export function calculateFeederHealth(
  feeder: GplFeeder,
  outages: GplOutage[],
  refDate?: Date
): FeederHealth {
  const { weights } = GPL_CONFIG.feederHealth;
  const recent = outagesInWindow(outages, 30, refDate).filter(
    (o) => o.feeder_id === feeder.id || o.feeder_code === feeder.code
  );

  // Frequency sub-score
  const freqScore = lookupScore(
    GPL_CONFIG.frequencyScoring as unknown as Record<number, number>,
    recent.length
  );

  // Restoration sub-score
  const durations = recent
    .map((o) => o.duration_minutes)
    .filter((d): d is number => d != null && d > 0);
  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;
  const restScore = lookupScore(
    GPL_CONFIG.restorationScoring as unknown as Record<number, number>,
    avgDuration
  );

  // Customer exposure sub-score: CMI per 1000 customers for this feeder
  const totalCMI = recent.reduce((sum, o) => {
    return sum + (o.duration_minutes ?? 0) * (o.customers_affected ?? 0);
  }, 0);
  const cmiPer1000 = feeder.customer_count > 0
    ? (totalCMI / feeder.customer_count) * 1000
    : 0;
  const custScore = clamp(Math.round(100 - (cmiPer1000 / 500) * 50), 0, 100);

  const score = Math.round(
    freqScore * weights.frequency +
    restScore * weights.restoration +
    custScore * weights.customerExposure
  );

  const sorted = recent
    .filter((o) => o.date)
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    feeder_id: feeder.id,
    feeder_code: feeder.code,
    feeder_name: feeder.name,
    substation_code: feeder.substation_code,
    area_served: feeder.area_served,
    customer_count: feeder.customer_count,
    grade: calculateFeederGrade(score),
    score,
    outages_30d: recent.length,
    avg_duration_min: Math.round(avgDuration * 10) / 10,
    total_customer_minutes: totalCMI,
    trend: calculateTrend(outages, feeder, refDate),
    last_outage: sorted[0]?.date ?? null,
  };
}

// ── Trend ───────────────────────────────────────────────────────────────────

export function calculateTrend(
  allOutages: GplOutage[],
  feeder: GplFeeder,
  refDate?: Date
): TrendDirection {
  const ref = refDate ?? new Date();
  const feederOutages = allOutages.filter(
    (o) => o.feeder_id === feeder.id || o.feeder_code === feeder.code
  );

  const current = outagesInWindow(feederOutages, 30, ref);

  const prevRef = new Date(ref);
  prevRef.setDate(prevRef.getDate() - 30);
  const previous = outagesInWindow(feederOutages, 30, prevRef);

  if (current.length < previous.length) return 'improving';
  if (current.length > previous.length) return 'worsening';
  return 'stable';
}

// ── Monthly Aggregation ─────────────────────────────────────────────────────

export function aggregateMonthly(
  outages: GplOutage[],
  feeders: GplFeeder[]
): MonthSummary[] {
  // Group outages by YYYY-MM
  const byMonth = new Map<string, GplOutage[]>();
  for (const o of outages) {
    if (!o.date) continue;
    const month = o.date.slice(0, 7); // YYYY-MM
    const arr = byMonth.get(month) ?? [];
    arr.push(o);
    byMonth.set(month, arr);
  }

  const feederMap = new Map(feeders.map((f) => [f.code, f]));
  const months = Array.from(byMonth.keys()).sort();
  const summaries: MonthSummary[] = [];

  for (let i = 0; i < months.length; i++) {
    const month = months[i];
    const monthOutages = byMonth.get(month)!;

    // Basic stats
    const durations = monthOutages
      .map((o) => o.duration_minutes)
      .filter((d): d is number => d != null);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    const totalCustomers = monthOutages.reduce(
      (sum, o) => sum + (o.customers_affected ?? 0),
      0
    );
    const totalEns = monthOutages.reduce(
      (sum, o) => sum + (o.ens_mwh ?? 0),
      0
    );

    // By substation
    const subMap = new Map<string, MonthSubstationBreakdown>();
    for (const o of monthOutages) {
      const code = o.substation_code ?? 'UNKNOWN';
      const existing = subMap.get(code) ?? {
        substation_code: code,
        outage_count: 0,
        total_duration_min: 0,
        customers_affected: 0,
      };
      existing.outage_count++;
      existing.total_duration_min += o.duration_minutes ?? 0;
      existing.customers_affected += o.customers_affected ?? 0;
      subMap.set(code, existing);
    }

    // By cause
    const causeMap = new Map<string, number>();
    for (const o of monthOutages) {
      const cause = o.cause_subcategory ?? 'Unknown';
      causeMap.set(cause, (causeMap.get(cause) ?? 0) + 1);
    }
    const byCause: MonthCauseBreakdown[] = Array.from(causeMap.entries())
      .map(([cause_subcategory, count]) => ({
        cause_subcategory,
        count,
        pct: Math.round((count / monthOutages.length) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    // Worst feeders
    const feederCounts = new Map<string, { count: number; duration: number; customers: number }>();
    for (const o of monthOutages) {
      const code = o.feeder_code ?? 'UNKNOWN';
      const existing = feederCounts.get(code) ?? { count: 0, duration: 0, customers: 0 };
      existing.count++;
      existing.duration += o.duration_minutes ?? 0;
      existing.customers += o.customers_affected ?? 0;
      feederCounts.set(code, existing);
    }
    const worstFeeders: MonthWorstFeeder[] = Array.from(feederCounts.entries())
      .map(([code, stats]) => ({
        feeder_code: code,
        feeder_name: feederMap.get(code)?.name ?? code,
        outage_count: stats.count,
        total_duration_min: stats.duration,
        customers_affected: stats.customers,
      }))
      .sort((a, b) => b.outage_count - a.outage_count)
      .slice(0, 5);

    // vs previous month
    let vs_previous: MonthSummary['vs_previous'] = null;
    if (i > 0) {
      const prev = summaries[i - 1];
      vs_previous = {
        outage_count_delta: monthOutages.length - prev.outage_count,
        avg_duration_delta: Math.round((avgDuration - prev.avg_duration_min) * 10) / 10,
        customers_affected_delta: totalCustomers - prev.total_customers_affected,
      };
    }

    summaries.push({
      month,
      outage_count: monthOutages.length,
      avg_duration_min: Math.round(avgDuration * 10) / 10,
      total_customers_affected: totalCustomers,
      total_ens_mwh: Math.round(totalEns * 1000) / 1000,
      by_substation: Array.from(subMap.values()).sort((a, b) => b.outage_count - a.outage_count),
      by_cause: byCause,
      worst_feeders: worstFeeders,
      vs_previous,
    });
  }

  return summaries;
}
