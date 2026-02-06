/**
 * Agency Health Score Computation
 *
 * Centralized health scoring for GPL, GWI, CJIA, GCAA.
 * Each function returns a 1-10 score with label and breakdown.
 */

import type { GPLData, CJIAData, GCAAData } from '@/data/mockData';

// ── Types ───────────────────────────────────────────────────────────────────

export interface HealthBreakdownItem {
  factor: string;
  weight: number;       // 0.0-1.0
  score: number;        // 1-10
  actualValue: string;  // e.g. "21.6%", "65%", "N/A"
  description?: string; // One-sentence explanation
}

export interface HealthScore {
  score: number;       // 1-10
  label: string;       // Critical | Concerning | Mixed | Stable | Strong
  severity: 'critical' | 'warning' | 'stable' | 'positive';
  breakdown: HealthBreakdownItem[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function scoreToLabel(score: number): { label: string; severity: HealthScore['severity'] } {
  if (score < 4) return { label: 'Critical', severity: 'critical' };
  if (score < 6) return { label: 'Concerning', severity: 'warning' };
  if (score < 7) return { label: 'Mixed', severity: 'stable' };
  if (score < 9) return { label: 'Stable', severity: 'stable' };
  return { label: 'Strong', severity: 'positive' };
}

function weightedScore(breakdown: HealthBreakdownItem[]): number {
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

  const breakdown: HealthBreakdownItem[] = [
    { factor: 'Reserve Margin', weight: 0.30, score: reserveScore, actualValue: `${reserveMarginPct.toFixed(1)}%`, description: 'Percentage of total capacity above evening peak demand' },
    { factor: 'System Losses', weight: 0.20, score: lossScore, actualValue: losses !== null ? `${losses}%` : 'N/A', description: 'Forced outage rate or system losses percentage' },
    { factor: 'Station Availability', weight: 0.20, score: availScore, actualValue: `${stationAvailPct.toFixed(0)}%`, description: 'Available capacity as percentage of derated capacity' },
    { factor: 'Collection Rate', weight: 0.15, score: collectionScore, actualValue: collectionRate !== null ? `${collectionRate}%` : 'N/A', description: 'Revenue collection rate from KPI data' },
    { factor: 'Peak vs Capacity', weight: 0.15, score: demandScore, actualValue: `${demandRatio.toFixed(0)}%`, description: 'Evening peak demand as percentage of total DBIS capacity' },
  ];

  const score = weightedScore(breakdown);
  const { label, severity } = scoreToLabel(score);

  return { score, label, severity, breakdown };
}

// ── GWI Health ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface GWIReportData {
  customer_service_data?: any;
  collections_data?: any;
  financial_data?: any;
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
      breakdown: [{ factor: 'AI Analysis', weight: 1.0, score: insightsScore, actualValue: `${insightsScore.toFixed(1)}/10`, description: 'Score generated by AI analysis of monthly report data' }],
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

  const netProfitLabel = netProfit === null ? 'N/A' : netProfit > 0 ? 'Positive' : 'Negative';
  const breakdown: HealthBreakdownItem[] = [
    { factor: 'Collection Efficiency', weight: 0.25, score: collEffScore, actualValue: onTimePct !== null ? `${onTimePct}%` : 'N/A', description: 'On-time payment percentage from collections data' },
    { factor: 'Complaint Resolution', weight: 0.25, score: resScore, actualValue: resolutionRate !== null ? `${resolutionRate}%` : 'N/A', description: 'Customer complaint resolution rate' },
    { factor: 'Within Timeline', weight: 0.20, score: timelineScore, actualValue: withinTimeline !== null ? `${withinTimeline}%` : 'N/A', description: 'Percentage of service requests resolved within target timeline' },
    { factor: 'Financial Health', weight: 0.15, score: finScore, actualValue: netProfitLabel, description: 'Net profit/loss status and subvention dependency' },
    { factor: 'AR Trend', weight: 0.15, score: arScore, actualValue: 'Neutral', description: 'Accounts receivable trend (requires prior month comparison)' },
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

  const breakdown: HealthBreakdownItem[] = [
    { factor: 'On-Time Performance', weight: 0.25, score: otpScore, actualValue: otp !== null ? `${otp}%` : 'N/A', description: 'Flight on-time departure and arrival rate' },
    { factor: 'Passenger Throughput', weight: 0.25, score: throughputScore, actualValue: yoyGrowth !== null ? `${yoyGrowth > 0 ? '+' : ''}${yoyGrowth}% YoY` : 'N/A', description: 'Year-over-year passenger volume change' },
    { factor: 'Revenue vs Target', weight: 0.25, score: revenueScore, actualValue: 'No data', description: 'Airport revenue performance against budget targets' },
    { factor: 'Safety', weight: 0.25, score: safetyScore, actualValue: `${incidents} incident${incidents !== 1 ? 's' : ''}`, description: 'Number of reported safety incidents' },
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

  const breakdown: HealthBreakdownItem[] = [
    { factor: 'Compliance Rate', weight: 0.30, score: complianceScore, actualValue: cr !== null ? `${cr}%` : 'N/A', description: 'Overall regulatory compliance percentage' },
    { factor: 'Inspection Progress', weight: 0.25, score: inspectionScore, actualValue: progressPct !== null ? `${progressPct.toFixed(0)}%` : 'N/A', description: 'Month-to-date inspections completed vs target' },
    { factor: 'Incident Count', weight: 0.25, score: incidentScore, actualValue: '0 assumed', description: 'Aviation safety incidents reported this period' },
    { factor: 'Certification Backlog', weight: 0.20, score: certScore, actualValue: `${pending} pending`, description: 'Certification applications awaiting processing' },
  ];

  const score = weightedScore(breakdown);
  const { label, severity } = scoreToLabel(score);

  return { score, label, severity, breakdown };
}
