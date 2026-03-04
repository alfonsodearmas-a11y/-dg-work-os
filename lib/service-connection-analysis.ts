// Service Connection Efficiency Analysis
// Computes efficiency metrics, monthly volumes, and stage analysis from service_connections data.

import type {
  ServiceConnection,
  EfficiencyMetrics,
  TrackMetrics,
  StageMetrics,
  MonthlyVolume,
  RegionMetrics,
} from './service-connection-types';
import { SLA_TARGETS, STAGE_SLA } from './service-connection-types';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/** Filter out legacy records */
function nonLegacy(connections: ServiceConnection[]): ServiceConnection[] {
  return connections.filter(c => !c.is_legacy && c.status !== 'legacy_excluded');
}

function computeTrackMetrics(
  connections: ServiceConnection[],
  track: 'A' | 'B' | 'Design' | 'all'
): TrackMetrics {
  const filtered = track === 'all'
    ? connections
    : connections.filter(c => c.track === track);

  const completed = filtered.filter(c => c.status === 'completed');
  const open = filtered.filter(c => c.status === 'open');

  const completionDays = completed
    .map(c => c.total_days_to_complete)
    .filter((d): d is number => d !== null && d >= 0);

  const slaTarget = track === 'A' ? SLA_TARGETS.TRACK_A_OVERALL
    : track === 'B' ? SLA_TARGETS.TRACK_B_OVERALL
    : track === 'Design' ? SLA_TARGETS.DESIGN_OVERALL
    : SLA_TARGETS.TRACK_B_OVERALL;

  const withinSla = completionDays.filter(d => d <= slaTarget).length;

  return {
    track,
    completedCount: completed.length,
    avgDays: avg(completionDays),
    medianDays: median(completionDays),
    slaTarget,
    slaPct: completionDays.length > 0 ? Math.round((withinSla / completionDays.length) * 100) : 0,
    openCount: open.length,
  };
}

/** Compute per-stage metrics from completed connections' stage_history */
function computeStageMetrics(connections: ServiceConnection[]): StageMetrics[] {
  const stageData = new Map<string, number[]>();

  for (const conn of connections) {
    if (!conn.stage_history || !Array.isArray(conn.stage_history)) continue;
    for (const entry of conn.stage_history) {
      if (entry.days !== null && entry.days >= 0) {
        if (!stageData.has(entry.stage)) stageData.set(entry.stage, []);
        stageData.get(entry.stage)!.push(entry.days);
      }
    }
  }

  // Also include currently open connections' time in current stage
  for (const conn of connections) {
    if (conn.status === 'open' && conn.current_stage && conn.stage_history?.length) {
      const lastEntry = conn.stage_history[conn.stage_history.length - 1];
      if (!lastEntry.exited && lastEntry.entered) {
        const now = new Date().toISOString().slice(0, 10);
        const days = Math.round(
          (new Date(now).getTime() - new Date(lastEntry.entered).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (days >= 0) {
          if (!stageData.has(conn.current_stage)) stageData.set(conn.current_stage, []);
          stageData.get(conn.current_stage)!.push(days);
        }
      }
    }
  }

  const metrics: StageMetrics[] = [];
  for (const [stage, days] of stageData) {
    const slaTarget = STAGE_SLA[stage] || 14;
    const withinSla = days.filter(d => d <= slaTarget).length;
    metrics.push({
      stage,
      count: days.length,
      avgDays: avg(days),
      medianDays: median(days),
      slaTarget,
      slaPct: days.length > 0 ? Math.round((withinSla / days.length) * 100) : 0,
      maxDays: Math.max(...days, 0),
    });
  }

  return metrics.sort((a, b) => b.count - a.count);
}

/** Compute monthly opened/completed/queue volumes */
export function computeMonthlyVolumes(connections: ServiceConnection[]): MonthlyVolume[] {
  const monthMap = new Map<string, { opened: number; completed: number; completionDays: number[] }>();

  for (const conn of connections) {
    // Opened month
    const openMonth = conn.first_seen_date?.slice(0, 7);
    if (openMonth) {
      if (!monthMap.has(openMonth)) monthMap.set(openMonth, { opened: 0, completed: 0, completionDays: [] });
      monthMap.get(openMonth)!.opened++;
    }

    // Completed month
    if (conn.status === 'completed' && conn.disappeared_date) {
      const closeMonth = conn.disappeared_date.slice(0, 7);
      if (!monthMap.has(closeMonth)) monthMap.set(closeMonth, { opened: 0, completed: 0, completionDays: [] });
      monthMap.get(closeMonth)!.completed++;
      if (conn.total_days_to_complete !== null && conn.total_days_to_complete >= 0) {
        monthMap.get(closeMonth)!.completionDays.push(conn.total_days_to_complete);
      }
    }
  }

  // Sort months and compute queue depth
  const months = Array.from(monthMap.keys()).sort();
  let queueDepth = 0;
  const volumes: MonthlyVolume[] = [];

  for (const month of months) {
    const data = monthMap.get(month)!;
    queueDepth += data.opened - data.completed;

    // Track A/B SLA for this month's completed
    const monthCompleted = connections.filter(c =>
      c.status === 'completed' &&
      c.disappeared_date?.slice(0, 7) === month &&
      c.total_days_to_complete !== null
    );
    const trackACompleted = monthCompleted.filter(c => c.track === 'A');
    const trackBCompleted = monthCompleted.filter(c => c.track === 'B');
    const designCompleted = monthCompleted.filter(c => c.track === 'Design');

    const trackASla = trackACompleted.length > 0
      ? Math.round((trackACompleted.filter(c => (c.total_days_to_complete || 0) <= SLA_TARGETS.TRACK_A_OVERALL).length / trackACompleted.length) * 100)
      : null;
    const trackBSla = trackBCompleted.length > 0
      ? Math.round((trackBCompleted.filter(c => (c.total_days_to_complete || 0) <= SLA_TARGETS.TRACK_B_OVERALL).length / trackBCompleted.length) * 100)
      : null;
    const designSla = designCompleted.length > 0
      ? Math.round((designCompleted.filter(c => (c.total_days_to_complete || 0) <= SLA_TARGETS.DESIGN_OVERALL).length / designCompleted.length) * 100)
      : null;

    volumes.push({
      month,
      opened: data.opened,
      completed: data.completed,
      netChange: data.opened - data.completed,
      queueDepth: Math.max(queueDepth, 0),
      avgDaysToComplete: data.completionDays.length > 0 ? avg(data.completionDays) : null,
      trackASla,
      trackBSla,
      designSla,
    });
  }

  return volumes;
}

/** Compute regional metrics */
function computeRegionMetrics(connections: ServiceConnection[]): RegionMetrics[] {
  const regionMap = new Map<string, { open: number; completed: number; days: number[] }>();

  for (const conn of connections) {
    const region = conn.region || 'Unknown';
    if (!regionMap.has(region)) regionMap.set(region, { open: 0, completed: 0, days: [] });
    const rm = regionMap.get(region)!;

    if (conn.status === 'open') rm.open++;
    if (conn.status === 'completed') {
      rm.completed++;
      if (conn.total_days_to_complete !== null) rm.days.push(conn.total_days_to_complete);
    }
  }

  return Array.from(regionMap.entries())
    .map(([region, data]) => ({
      region,
      openCount: data.open,
      completedCount: data.completed,
      avgDays: avg(data.days),
    }))
    .sort((a, b) => (b.openCount + b.completedCount) - (a.openCount + a.completedCount));
}

/** Compute weighted overall SLA from per-track results */
function computeWeightedOverall(
  connections: ServiceConnection[],
  trackA: TrackMetrics,
  trackB: TrackMetrics,
  design: TrackMetrics
): TrackMetrics {
  const allCompleted = connections.filter(c => c.status === 'completed');
  const allOpen = connections.filter(c => c.status === 'open');
  const allDays = allCompleted
    .map(c => c.total_days_to_complete)
    .filter((d): d is number => d !== null && d >= 0);

  // Weighted SLA: count records within their *own* track's SLA target
  let totalWithinSla = 0;
  let totalWithDays = 0;
  for (const c of allCompleted) {
    if (c.total_days_to_complete === null || c.total_days_to_complete < 0) continue;
    totalWithDays++;
    const target = c.track === 'A' ? SLA_TARGETS.TRACK_A_OVERALL
      : c.track === 'B' ? SLA_TARGETS.TRACK_B_OVERALL
      : c.track === 'Design' ? SLA_TARGETS.DESIGN_OVERALL
      : SLA_TARGETS.TRACK_B_OVERALL;
    if (c.total_days_to_complete <= target) totalWithinSla++;
  }

  return {
    track: 'all',
    completedCount: allCompleted.length,
    avgDays: avg(allDays),
    medianDays: median(allDays),
    slaTarget: 0, // not meaningful for weighted overall
    slaPct: totalWithDays > 0 ? Math.round((totalWithinSla / totalWithDays) * 100) : 0,
    openCount: allOpen.length,
  };
}

/** Main function: compute all efficiency metrics */
export function computeEfficiencyMetrics(allConnections: ServiceConnection[]): EfficiencyMetrics {
  const connections = nonLegacy(allConnections);
  const legacyCount = allConnections.filter(c => c.is_legacy || c.status === 'legacy_excluded').length;

  const trackA = computeTrackMetrics(connections, 'A');
  const trackB = computeTrackMetrics(connections, 'B');
  const design = computeTrackMetrics(connections, 'Design');
  const overall = computeWeightedOverall(connections, trackA, trackB, design);

  return {
    overall,
    trackA,
    trackB,
    design,
    stages: computeStageMetrics(connections),
    monthly: computeMonthlyVolumes(connections),
    regions: computeRegionMetrics(connections),
    totalOpen: connections.filter(c => c.status === 'open').length,
    totalCompleted: connections.filter(c => c.status === 'completed').length,
    totalLegacy: legacyCount,
  };
}
