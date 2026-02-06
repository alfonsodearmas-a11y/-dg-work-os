/**
 * Agency Health Score Computation
 *
 * Centralized health scoring for GPL, GWI, CJIA, GCAA.
 * Each function returns a 1-10 score with label and breakdown.
 */

import type { GPLData, CJIAData, GCAAData } from '@/data/mockData';

// ── Types ───────────────────────────────────────────────────────────────────

export interface HealthScore {
  score: number;       // 1-10
  label: string;       // Critical | Concerning | Mixed | Stable | Strong
  severity: 'critical' | 'warning' | 'stable' | 'positive';
  breakdown: { factor: string; weight: number; score: number }[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function scoreToLabel(score: number): { label: string; severity: HealthScore['severity'] } {
  if (score < 4) return { label: 'Critical', severity: 'critical' };
  if (score < 6) return { label: 'Concerning', severity: 'warning' };
  if (score < 7) return { label: 'Mixed', severity: 'stable' };
  if (score < 9) return { label: 'Stable', severity: 'stable' };
  return { label: 'Strong', severity: 'positive' };
}

function weightedScore(breakdown: { factor: string; weight: number; score: number }[]): number {
  const total = breakdown.reduce((sum, b) => sum + b.weight * b.score, 0);
  return Math.round(total * 10) / 10;
}

function rangeScore(value: number, thresholds: [number, number, number, number, number, number, number, number]): number {
  // thresholds: [v1, s1, v2, s2, v3, s3, v4_default_score]
  // Actually let's use a simpler approach with explicit ranges
  return value; // placeholder — actual scoring uses specific per-metric logic below
}

// ── GPL Health ──────────────────────────────────────────────────────────────

export function computeGPLHealth(data: GPLData | null | undefined, kpiData?: Record<string, number>): HealthScore | null {
  if (!data || !data.powerStations || data.powerStations.length === 0) return null;

  const totalDerated = data.powerStations.reduce((s, st) => s + st.derated, 0);
  const totalAvailable = data.powerStations.reduce((s, st) => s + st.available, 0);
  const totalDBIS = totalDerated + (data.totalRenewableCapacity || 0);
  const eveningPeak = data.actualEveningPeak?.onBars || 0;

  // Reserve Margin (30%)
  const reserveMarginPct = totalDBIS > 0 ? ((totalDBIS - eveningPeak) / totalDBIS) * 100 : 0;
  const reserveScore = reserveMarginPct > 20 ? 10 : reserveMarginPct > 15 ? 7 : reserveMarginPct > 10 ? 5 : 2;

  // System Losses / Forced Outage Rate (20%)
  const losses = kpiData?.['System Losses %'] ?? data.forcedOutageRate ?? null;
  const lossScore = losses === null ? 6 : losses < 20 ? 10 : losses < 25 ? 7 : losses < 30 ? 4 : 2;

  // Station Availability (20%)
  const stationAvailPct = totalDerated > 0 ? (totalAvailable / totalDerated) * 100 : 0;
  const availScore = stationAvailPct > 80 ? 10 : stationAvailPct > 60 ? 6 : 3;

  // Collection Rate (15%)
  const collectionRate = kpiData?.['Collection Rate %'] ?? null;
  const collectionScore = collectionRate === null ? 6 : collectionRate > 95 ? 10 : collectionRate > 85 ? 7 : 4;

  // Peak Demand vs Capacity (15%)
  const demandRatio = totalDBIS > 0 ? (eveningPeak / totalDBIS) * 100 : 100;
  const demandScore = demandRatio < 70 ? 10 : demandRatio < 85 ? 7 : demandRatio < 95 ? 4 : 1;

  const breakdown = [
    { factor: 'Reserve Margin', weight: 0.30, score: reserveScore },
    { factor: 'System Losses', weight: 0.20, score: lossScore },
    { factor: 'Station Availability', weight: 0.20, score: availScore },
    { factor: 'Collection Rate', weight: 0.15, score: collectionScore },
    { factor: 'Peak vs Capacity', weight: 0.15, score: demandScore },
  ];

  const score = weightedScore(breakdown);
  const { label, severity } = scoreToLabel(score);

  return { score, label, severity, breakdown };
}

// ── GWI Health ──────────────────────────────────────────────────────────────

interface GWIReportData {
  customer_service_data?: Record<string, unknown>;
  collections_data?: Record<string, unknown>;
  financial_data?: Record<string, unknown>;
}

export function computeGWIHealth(
  report: GWIReportData | null | undefined,
  insightsScore?: number | null
): HealthScore | null {
  // Prefer AI-generated score
  if (insightsScore && insightsScore >= 1 && insightsScore <= 10) {
    const { label, severity } = scoreToLabel(insightsScore);
    return {
      score: insightsScore,
      label,
      severity,
      breakdown: [{ factor: 'AI Analysis', weight: 1.0, score: insightsScore }],
    };
  }

  if (!report) return null;

  const cs = report.customer_service_data as Record<string, number> | undefined;
  const coll = report.collections_data as Record<string, number> | undefined;
  const fin = report.financial_data as Record<string, number> | undefined;

  if (!cs && !coll && !fin) return null;

  // Collection Efficiency (25%)
  const onTimePct = coll?.on_time_payment_pct ?? coll?.on_time_payments_pct ?? null;
  const collEffScore = onTimePct === null ? 6 : onTimePct > 60 ? 10 : onTimePct > 45 ? 6 : 3;

  // Complaint Resolution (25%)
  const resolutionRate = cs?.resolution_rate_pct ?? null;
  const resScore = resolutionRate === null ? 6 : resolutionRate > 95 ? 10 : resolutionRate > 85 ? 7 : 4;

  // Within Timeline (20%)
  const withinTimeline = cs?.within_timeline_pct ?? null;
  const timelineScore = withinTimeline === null ? 6 : withinTimeline > 85 ? 10 : withinTimeline > 70 ? 6 : 3;

  // Financial Health (15%)
  const netProfit = fin?.net_profit ?? fin?.net_profit_loss ?? null;
  const govtSubvention = fin?.govt_subvention ?? 0;
  const finScore = netProfit === null ? 6 : netProfit > 0 ? 8 : govtSubvention > 0 ? 5 : 3;

  // AR Trend (15%) — use a neutral default since we'd need prior month to detect trend
  const arScore = 6;

  const breakdown = [
    { factor: 'Collection Efficiency', weight: 0.25, score: collEffScore },
    { factor: 'Complaint Resolution', weight: 0.25, score: resScore },
    { factor: 'Within Timeline', weight: 0.20, score: timelineScore },
    { factor: 'Financial Health', weight: 0.15, score: finScore },
    { factor: 'AR Trend', weight: 0.15, score: arScore },
  ];

  const score = weightedScore(breakdown);
  const { label, severity } = scoreToLabel(score);

  return { score, label, severity, breakdown };
}

// ── CJIA Health ─────────────────────────────────────────────────────────────

export function computeCJIAHealth(data: CJIAData | null | undefined): HealthScore | null {
  if (!data) return null;

  // On-Time Performance (25%)
  const otp = data.onTimePercent ?? null;
  const otpScore = otp === null ? 7 : otp >= 90 ? 10 : otp >= 85 ? 7 : otp >= 80 ? 4 : 1;

  // Passenger Throughput — YoY growth (25%)
  const yoyGrowth = data.mtdYoyChange ?? null;
  const throughputScore = yoyGrowth === null ? 7
    : (yoyGrowth >= 5 && yoyGrowth <= 15) ? 10
    : ((yoyGrowth >= 0 && yoyGrowth < 5) || (yoyGrowth > 15 && yoyGrowth <= 20)) ? 7
    : 4;

  // Revenue vs Target (25%) — no data yet, default 7
  const revenueScore = 7;

  // Safety (25%)
  const incidents = data.safetyIncidents ?? 0;
  const safetyScore = incidents === 0 ? 10 : incidents === 1 ? 5 : 1;

  const breakdown = [
    { factor: 'On-Time Performance', weight: 0.25, score: otpScore },
    { factor: 'Passenger Throughput', weight: 0.25, score: throughputScore },
    { factor: 'Revenue vs Target', weight: 0.25, score: revenueScore },
    { factor: 'Safety', weight: 0.25, score: safetyScore },
  ];

  const score = weightedScore(breakdown);
  const { label, severity } = scoreToLabel(score);

  return { score, label, severity, breakdown };
}

// ── GCAA Health ─────────────────────────────────────────────────────────────

export function computeGCAAHealth(data: GCAAData | null | undefined): HealthScore | null {
  if (!data) return null;

  // Compliance Rate (30%)
  const cr = data.complianceRate ?? null;
  const complianceScore = cr === null ? 6 : cr >= 95 ? 10 : cr >= 90 ? 7 : cr >= 85 ? 4 : 1;

  // Inspection Progress (25%)
  const progressPct = (data.inspectionsTarget && data.inspectionsTarget > 0)
    ? (data.inspectionsMTD / data.inspectionsTarget) * 100
    : null;
  const inspectionScore = progressPct === null ? 6 : progressPct >= 90 ? 10 : progressPct >= 75 ? 7 : progressPct >= 50 ? 4 : 1;

  // Incident Count (25%) — using safetyAudits as proxy (lower is better for incidents)
  // GCAA mock data doesn't have an explicit incident count field, use 0 as default
  const incidentScore = 10; // 0 incidents assumed from mock data

  // Certification Backlog (20%)
  const pending = data.pendingCertifications ?? 0;
  const certScore = pending <= 3 ? 10 : pending <= 6 ? 7 : pending <= 10 ? 4 : 1;

  const breakdown = [
    { factor: 'Compliance Rate', weight: 0.30, score: complianceScore },
    { factor: 'Inspection Progress', weight: 0.25, score: inspectionScore },
    { factor: 'Incident Count', weight: 0.25, score: incidentScore },
    { factor: 'Certification Backlog', weight: 0.20, score: certScore },
  ];

  const score = weightedScore(breakdown);
  const { label, severity } = scoreToLabel(score);

  return { score, label, severity, breakdown };
}
