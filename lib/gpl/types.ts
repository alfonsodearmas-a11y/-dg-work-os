// GPL Service Connection Module — Type Definitions

// ── Pipeline Model ──────────────────────────────────────────────────────────

export type Track = 'A' | 'B';
export type Stage = 'metering' | 'design' | 'execution';
export type Category = 'outstanding' | 'completed';

// ── SLA Targets ─────────────────────────────────────────────────────────────

export const SLA_TARGETS: Record<string, number> = {
  'A:metering': 3,
  'B:design': 12,
  'B:execution': 30, // customer-facing
};

export const SLA_INTERNAL: Record<string, number> = {
  'B:execution': 26, // internal target
};

// ── Ageing Bucket Definitions (Stage-Specific) ─────────────────────────────

export interface AgeingBucket {
  label: string;
  min: number;
  max: number | null;
  count: number;
  pct: number;
}

export const AGEING_BUCKETS: Record<string, [string, number, number | null][]> = {
  'A:metering': [
    ['0-3d', 0, 3],
    ['4-7d', 4, 7],
    ['8-14d', 8, 14],
    ['15-30d', 15, 30],
    ['31-60d', 31, 60],
    ['61+d', 61, null],
  ],
  'B:design': [
    ['0-5d', 0, 5],
    ['6-12d', 6, 12],
    ['13-20d', 13, 20],
    ['21-30d', 21, 30],
    ['31+d', 31, null],
  ],
  'B:execution': [
    ['0-10d', 0, 10],
    ['11-20d', 11, 20],
    ['21-26d', 21, 26],
    ['27-30d', 27, 30],
    ['31-60d', 31, 60],
    ['61+d', 61, null],
  ],
};

// ── Parser Types ────────────────────────────────────────────────────────────

export interface GPLOutstandingRecord {
  row_number: number;
  customer_number: string | null;
  account_number: string | null;
  customer_name: string | null;
  service_address: string | null;
  town_city: string | null;
  account_status: string | null;
  cycle: string | null;
  account_type: string | null;
  division_code: string | null;
  service_order_number: string | null;
  service_type: string | null;
  date_created: Date | null;
  current_date_ref: Date | null;
  days_elapsed: number | null;
  days_elapsed_calculated: number | null;
}

export interface GPLCompletedRecord {
  row_number: number;
  customer_number: string | null;
  account_number: string | null;
  customer_name: string | null;
  service_address: string | null;
  town_city: string | null;
  account_status: string | null;
  cycle: string | null;
  account_type: string | null;
  service_order_number: string | null;
  service_type: string | null;
  date_created: Date | null;
  date_completed: Date | null;
  created_by: string | null;
  days_taken: number | null;
  days_taken_calculated: number | null;
  is_data_quality_error: boolean;
  data_quality_note: string | null;
}

export interface GPLParsedSheet {
  sheetName: string;
  track: Track;
  stage: Stage;
  category: Category;
  records: GPLOutstandingRecord[] | GPLCompletedRecord[];
  recordCount: number;
}

export interface GPLDataWarning {
  type: 'reversed_date' | 'formula_error' | 'backdated_entry' | 'same_day_completion' | 'duplicate_within_sheet' | 'duplicate_cross_stage' | 'missing_field' | 'reclassification' | 'summary_mismatch';
  severity: 'error' | 'warning' | 'info';
  message: string;
  details?: Record<string, unknown>;
}

export interface GPLParseResult {
  snapshotDate: Date;
  fileName: string;
  sheets: GPLParsedSheet[];
  summaryValidation: {
    expected: Record<string, number>;
    actual: Record<string, number>;
    mismatches: string[];
  };
  warnings: GPLDataWarning[];
}

// ── Metrics Types ───────────────────────────────────────────────────────────

export interface StaffMetric {
  name: string;
  count: number;
  mean: number;
  median: number;
}

export interface GPLMetrics {
  track: Track;
  stage: Stage;
  category: Category;
  total_count: number;
  valid_count: number;
  error_count: number;
  sla_target_days: number;
  within_sla_count: number;
  sla_compliance_pct: number;
  mean_days: number | null;
  median_days: number | null;
  trimmed_mean_days: number | null;
  mode_days: number | null;
  std_dev: number | null;
  min_days: number | null;
  max_days: number | null;
  q1: number | null;
  q3: number | null;
  p90: number | null;
  p95: number | null;
  ageing_buckets: AgeingBucket[];
  staff_breakdown: StaffMetric[] | null;
}

// ── Database Row Types ──────────────────────────────────────────────────────

export interface GPLSnapshotRow {
  id: string;
  snapshot_date: string;
  uploaded_at: string;
  file_name: string | null;
  track_a_outstanding: number;
  track_a_completed: number;
  track_b_design_outstanding: number;
  track_b_execution_outstanding: number;
  track_b_design_completed: number;
  track_b_execution_completed: number;
  track_b_total_outstanding: number;
  data_quality_warnings: GPLDataWarning[];
  warning_count: number;
  user_id: string | null;
}

export interface GPLOutstandingRow {
  id: string;
  snapshot_id: string;
  track: Track;
  stage: Stage;
  row_number: number | null;
  customer_number: string | null;
  account_number: string | null;
  customer_name: string | null;
  service_address: string | null;
  town_city: string | null;
  account_status: string | null;
  cycle: string | null;
  account_type: string | null;
  division_code: string | null;
  service_order_number: string | null;
  service_type: string | null;
  date_created: string | null;
  current_date_ref: string | null;
  days_elapsed: number | null;
  days_elapsed_calculated: number | null;
}

export interface GPLCompletedRow {
  id: string;
  snapshot_id: string;
  track: Track;
  stage: Stage;
  row_number: number | null;
  customer_number: string | null;
  account_number: string | null;
  customer_name: string | null;
  service_address: string | null;
  town_city: string | null;
  account_status: string | null;
  cycle: string | null;
  account_type: string | null;
  service_order_number: string | null;
  service_type: string | null;
  date_created: string | null;
  date_completed: string | null;
  created_by: string | null;
  days_taken: number | null;
  days_taken_calculated: number | null;
  is_data_quality_error: boolean;
  data_quality_note: string | null;
}

export interface GPLMetricsRow {
  id: string;
  snapshot_id: string;
  track: Track;
  stage: Stage;
  category: Category;
  total_count: number;
  valid_count: number;
  error_count: number;
  sla_target_days: number;
  within_sla_count: number;
  sla_compliance_pct: number;
  mean_days: number | null;
  median_days: number | null;
  trimmed_mean_days: number | null;
  mode_days: number | null;
  std_dev: number | null;
  min_days: number | null;
  max_days: number | null;
  q1: number | null;
  q3: number | null;
  p90: number | null;
  p95: number | null;
  ageing_buckets: AgeingBucket[];
  staff_breakdown: StaffMetric[] | null;
}

export interface GPLChronicOutlierRow {
  id: string;
  account_number: string;
  customer_name: string | null;
  town_city: string | null;
  track: Track;
  stage: Stage;
  service_order_number: string | null;
  first_seen_date: string;
  first_seen_snapshot_id: string;
  latest_snapshot_id: string;
  latest_days_elapsed: number | null;
  consecutive_snapshots: number;
  date_created: string | null;
  resolved: boolean;
  resolved_date: string | null;
}
