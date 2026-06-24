// ── Database Row Types ───────────────────────────────────────────────────────

export interface DelayedProject {
  id: string;
  project_reference: string;
  executing_agency: string;
  sub_agency: string;
  project_name: string;
  region: string | null;
  tender_board_type: string | null;
  contract_value: number; // stored in cents (bigint)
  contractors: string | null;
  project_end_date: string | null; // ISO date
  completion_percent: number;
  has_images: boolean;
  status: 'DELAYED' | 'RESOLVED';
  source_id: number | null;
  resolved_at: string | null;
  reopened_at: string | null;
  last_seen_batch_id: string | null;
  resolved_by_batch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DelayedProjectSnapshot {
  id: string;
  project_id: string;
  snapshot_date: string; // ISO date
  completion_percent: number | null;
  contract_value: number | null;
  project_end_date: string | null;
  status: string | null;
  created_at: string;
}

export interface Intervention {
  id: string;
  project_id: string;
  intervention_type: InterventionType;
  description: string;
  assigned_to: string | null;
  due_date: string | null;
  status: InterventionStatus;
  created_by: string;
  created_at: string;
}

// ── Enums ────────────────────────────────────────────────────────────────────

export type RiskTier = 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_DATA';

export type InterventionType =
  | 'SITE_VISIT'
  | 'CONTRACTOR_MEETING'
  | 'ESCALATION_TO_PS'
  | 'BOND_WARNING'
  | 'TERMINATION_NOTICE'
  | 'TIMELINE_EXTENSION'
  | 'VARIATION_ORDER'
  | 'OTHER';

export type InterventionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';

export const INTERVENTION_TYPES: { value: InterventionType; label: string }[] = [
  { value: 'SITE_VISIT', label: 'Site Visit' },
  { value: 'CONTRACTOR_MEETING', label: 'Contractor Meeting' },
  { value: 'ESCALATION_TO_PS', label: 'Escalation to PS' },
  { value: 'BOND_WARNING', label: 'Bond Warning' },
  { value: 'TERMINATION_NOTICE', label: 'Termination Notice' },
  { value: 'TIMELINE_EXTENSION', label: 'Timeline Extension' },
  { value: 'VARIATION_ORDER', label: 'Variation Order' },
  { value: 'OTHER', label: 'Other' },
];

export const INTERVENTION_STATUS_OPTIONS: { value: InterventionStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'OVERDUE', label: 'Overdue' },
];

// ── Computed Fields ──────────────────────────────────────────────────────────

export interface ComputedFields {
  days_overdue: number | null;
  remaining_value: number;
  risk_tier: RiskTier;
  delta_completion: number | null;
  stalled_weeks: number | null;
  intervention_count: number;
  // Populated only in RESOLVED view
  resolved_by_file?: string | null;
  resolved_by_uploaded_at?: string | null;
}

export type DelayedProjectWithComputed = DelayedProject & ComputedFields;

// ── API Response Types ───────────────────────────────────────────────────────

export interface KpiProjectRef {
  name: string;
  agency: string;
  completion: number;
  days_overdue: number;
  remaining_value: number;
}

export interface WarRoomSummary {
  total_projects: number;
  total_contract_value: number; // cents
  total_exposure: number; // remaining value in cents
  avg_completion: number;
  critical_count: number; // risk_tier = HIGH
  longest_overdue: number; // days
  by_agency: AgencyBreakdown[];
  by_region: RegionBreakdown[];
  weekly_movement: WeeklyMovement | null;
  last_upload_date: string | null;
  snapshot_count: number;
  // Popover enrichment data
  longest_overdue_project: KpiProjectRef | null;
  critical_projects: KpiProjectRef[];
  top_exposure_projects: KpiProjectRef[];
}

export interface AgencyBreakdown {
  agency: string;
  count: number;
  total_value: number;
  avg_completion: number;
  avg_days_overdue: number;
}

export interface RegionBreakdown {
  region: string;
  count: number;
  total_exposure: number;
  avg_risk: number; // 0-1 where 1 is all HIGH
}

export interface WeeklyMovement {
  previous_date: string;
  current_date: string;
  progressed: number;
  stalled: number;
  regressed: number;
  new_entries: number;
  cleared: number;
  reopened: number;
  top_movers: DeltaEntry[];
  top_stalls: DeltaEntry[];
}

export interface DeltaEntry {
  project_id: string;
  project_name: string;
  sub_agency: string;
  previous_pct: number;
  current_pct: number;
  delta: number;
  stalled_weeks?: number;
}

// ── Upload / Batch Types ─────────────────────────────────────────────────────

export interface ClearedProjectRef {
  source_id: number | null;
  project_reference: string;
  project_name: string;
  sub_agency: string;
  completion_percent: number;
  contract_value: number;
  resolved_at: string;
  created_at: string | null;
  resolved_by_file?: string;
}

export interface ClearedAnalytics {
  count: number;
  total_contract_value: number;
  avg_days_to_clear: number | null;
}

export interface UploadBatch {
  id: string;
  file_name: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  row_count: number;
  new_count: number;
  updated_count: number;
  resolved_count: number;
  reopened_count: number;
  created_at: string;
}

export interface UploadResult {
  // Legacy fields — kept for UploadModal.tsx compat (Task 7 migrates them)
  updated: number;
  inserted: number;
  unchanged: number;
  not_in_upload: { project_reference: string; project_name: string; sub_agency: string }[];
  biggest_deltas: DeltaEntry[];
  snapshot_date: string;
  // New committed-count fields
  new_count: number;
  updated_count: number;
  resolved_count: number;
  reopened_count: number;
  cleared: ClearedProjectRef[];
  reopened: { project_name: string; sub_agency: string }[];
  cleared_analytics: ClearedAnalytics;
  partial: boolean;
  applied?: number;
  planned?: number;
  // Guard-trip response fields (only present when needsConfirmation = true)
  needsConfirmation?: boolean;
  activeDelayed?: number;
  absentCount?: number;
  absentFraction?: number;
  threshold?: number;
}

export interface InterventionSummary {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  overdue: number;
  projects_with_zero: number;
  total_projects: number;
}

export interface ProjectDetail extends DelayedProjectWithComputed {
  snapshots: DelayedProjectSnapshot[];
  interventions: Intervention[];
}

// ── Filter Types ─────────────────────────────────────────────────────────────

export interface RegistryFilters {
  sub_agencies?: string[];
  regions?: string[];
  risk_tiers?: RiskTier[];
  completion_min?: number;
  completion_max?: number;
  search?: string;
  sort?: string;
  sort_dir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  status?: 'DELAYED' | 'RESOLVED';
}

export interface InterventionFilters {
  project_id?: string;
  status?: InterventionStatus[];
  intervention_type?: InterventionType[];
  page?: number;
  limit?: number;
}

// ── Computation Helpers ──────────────────────────────────────────────────────

// Import and re-export existing utility to avoid duplication
import { getDaysOverdue } from '@/components/oversight/types';
export const computeDaysOverdue = getDaysOverdue;

export function computeRemainingValue(contractValue: number, completionPercent: number): number {
  return Math.round(contractValue * (1 - completionPercent / 100));
}

export function computeRiskTier(endDate: string | null, completionPercent: number, contractValue?: number): RiskTier {
  // Missing data = NO_DATA
  if (endDate === null || (contractValue !== undefined && contractValue === 0)) return 'NO_DATA';

  const daysOverdue = computeDaysOverdue(endDate);
  if (daysOverdue === null) return 'NO_DATA';

  const isOverdue = daysOverdue > 0;
  const isLowCompletion = completionPercent < 50;

  if (isOverdue && isLowCompletion) return 'HIGH';
  if (isOverdue || isLowCompletion) return 'MEDIUM';
  return 'LOW';
}

export function enrichProject(
  project: DelayedProject,
  deltaCompletion: number | null = null,
  stalledWeeks: number | null = null,
  interventionCount: number = 0,
): DelayedProjectWithComputed {
  return {
    ...project,
    days_overdue: computeDaysOverdue(project.project_end_date),
    remaining_value: computeRemainingValue(project.contract_value, project.completion_percent),
    risk_tier: computeRiskTier(project.project_end_date, project.completion_percent, project.contract_value),
    delta_completion: deltaCompletion,
    stalled_weeks: stalledWeeks,
    intervention_count: interventionCount,
  };
}
