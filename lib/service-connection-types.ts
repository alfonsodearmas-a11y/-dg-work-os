// Service Connection Efficiency Tracking — Type Definitions

export interface StageHistoryEntry {
  stage: string;
  entered: string;  // ISO date
  exited: string | null;
  days: number | null;
}

export interface ServiceConnection {
  id: string;
  customer_reference: string | null;
  service_order_number: string | null;
  first_name: string | null;
  last_name: string | null;
  telephone: string | null;
  region: string | null;
  district: string | null;
  village_ward: string | null;
  street: string | null;
  lot: string | null;
  account_type: string | null;
  service_order_type: string | null;
  division_code: string | null;
  cycle: string | null;
  application_date: string | null;
  track: 'A' | 'B' | 'unknown';
  job_complexity: 'simple' | 'extensive' | 'unknown';
  status: 'open' | 'completed' | 'cancelled' | 'legacy_excluded';
  current_stage: string | null;
  stage_history: StageHistoryEntry[];
  first_seen_date: string | null;
  last_seen_date: string | null;
  disappeared_date: string | null;
  energisation_date: string | null;
  total_days_to_complete: number | null;
  is_legacy: boolean;
  linked_so_number: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface TrackMetrics {
  track: 'A' | 'B' | 'all';
  completedCount: number;
  avgDays: number;
  medianDays: number;
  slaTarget: number;
  slaPct: number;
  openCount: number;
}

export interface StageMetrics {
  stage: string;
  count: number;
  avgDays: number;
  medianDays: number;
  slaTarget: number;
  slaPct: number;
  maxDays: number;
}

export interface MonthlyVolume {
  month: string; // YYYY-MM
  opened: number;
  completed: number;
  netChange: number;
  queueDepth: number;
  avgDaysToComplete: number | null;
  trackASla: number | null;
  trackBSla: number | null;
}

export interface RegionMetrics {
  region: string;
  openCount: number;
  completedCount: number;
  avgDays: number;
}

export interface EfficiencyMetrics {
  overall: TrackMetrics;
  trackA: TrackMetrics;
  trackB: TrackMetrics;
  stages: StageMetrics[];
  monthly: MonthlyVolume[];
  regions: RegionMetrics[];
  totalOpen: number;
  totalCompleted: number;
  totalLegacy: number;
}

export interface DiffResult {
  disappeared: number;
  newOrders: number;
  updated: number;
  stillOpen: number;
  legacyExcluded: number;
  completedIds: string[];
}

export interface MonthlyStats {
  id: string;
  report_month: string;
  opened_count: number;
  completed_count: number;
  queue_depth: number;
  avg_days_to_complete: number | null;
  median_days_to_complete: number | null;
  pct_within_sla: number | null;
  track_a_completed: number;
  track_a_avg_days: number | null;
  track_a_sla_pct: number | null;
  track_b_completed: number;
  track_b_avg_days: number | null;
  track_b_sla_pct: number | null;
  stage_breakdown: Record<string, unknown>;
  complexity_breakdown: Record<string, unknown>;
}

export interface AIInsight {
  executiveSummary: string;
  sections: {
    title: string;
    severity: 'critical' | 'warning' | 'stable' | 'positive';
    summary: string;
    detail: string;
  }[];
  recommendations: {
    category: string;
    recommendation: string;
    urgency: 'Immediate' | 'Short-term' | 'Long-term';
  }[];
}

// SLA targets in calendar days
export const SLA_TARGETS = {
  TRACK_A_OVERALL: 10,
  TRACK_B_DESIGN: 12,
  TRACK_B_EXECUTION: 26,
  TRACK_B_METERING: 3,
  TRACK_B_OVERALL: 41, // Design + Execution + Metering
} as const;

export const STAGE_SLA: Record<string, number> = {
  'Metering': 3,
  'Designs': 12,
  'Execution': 26,
  'Survey': 7,
  'Estimation': 5,
  'Approval': 3,
};

export const LEGACY_CUTOFF = '2015-01-01';
