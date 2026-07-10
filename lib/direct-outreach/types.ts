// Direct Outreach — shared types. Client-safe: types only, no server imports
// (mirrors the lib/calendar-types.ts client/server boundary pattern; the
// constants import below is type-only and erased at build).

import type { UserAgency } from '@/lib/constants/agencies';

/** OP Direct's ministry-level bucket (Public Utilities & Aviation = the ministry itself). */
export const OUTREACH_MINISTRY = 'PUA' as const;

/**
 * Agencies a case can belong to / be transferred to — THE single source for
 * the transfer enum, filter and transfer dropdowns, and scorecard ordering.
 * Every entry except PUA MUST be a valid users.agency value (the `satisfies`
 * clause enforces this at compile time) so agency_manager scoping and
 * assignment work unmodified. Adding an agency = one entry here.
 * GWI/GPL keep their positions so existing scorecard order is stable.
 */
export const OUTREACH_AGENCIES = [
  'GWI', 'GPL', 'HECI', 'MARAD', 'CJIA', 'GCAA', 'HAS', OUTREACH_MINISTRY,
] as const satisfies readonly (UserAgency | typeof OUTREACH_MINISTRY)[];

export type OutreachAgency = (typeof OUTREACH_AGENCIES)[number];

/** OP Direct case statuses (status_ids 1-7). */
export const OUTREACH_STATUSES = [
  'Open',
  'Referred',
  'Follow Up',
  'In Queue',
  'Unreachable',
  'Not Actionable',
  'Resolved',
] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

/** Keyword-classified issue themes (see classifyTheme in compute.ts). */
export const OUTREACH_THEMES = [
  'Water-Supply',
  'Water-Infrastructure/Quality',
  'Electricity-Supply',
  'Electricity-Infrastructure',
  'Billing-Subsidy',
  'Aviation-Transport',
  'Telecoms',
  'Other',
] as const;
export type OutreachTheme = (typeof OUTREACH_THEMES)[number];

export type PriorityFlag = 'Normal' | 'Elevated';

// ── Officer-driven working state (v3) ────────────────────────────────────────

/** Internal DG-OS progress — distinct from the imported OP Direct `status`,
 *  which stays the official one (only it opens/closes a case). */
export const OUTREACH_WORKING_STATUSES = [
  'not_started',
  'in_progress',
  'blocked',
  'resolved_pending_verification',
] as const;
export type OutreachWorkingStatus = (typeof OUTREACH_WORKING_STATUSES)[number];

export const OUTREACH_WORKING_STATUS_LABELS: Record<OutreachWorkingStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  resolved_pending_verification: 'Resolved — pending verification',
};

/** "No officer update in >Nd" threshold shared by the KPI card and filter pill. */
export const OUTREACH_STALE_OFFICER_DAYS = 14;

/** One row of the append-only officer progress log (survives uploads). */
export interface OutreachOfficerUpdate {
  id: string;
  case_id: number;
  /** Null = deleted user (renders "Former user"). */
  author_id: string | null;
  author_name: string | null;
  author_agency: string | null;
  /** Raw @[uuid] mention format (Tasks wire format); the client renders names. */
  body: string | null;
  new_working_status: OutreachWorkingStatus | null;
  new_target_date: string | null;
  target_cleared: boolean;
  created_at: string;
}

/** Current working state for one case ('not_started' + no target when no row). */
export interface OutreachCaseState {
  working_status: OutreachWorkingStatus;
  target_date: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_at: string | null;
}

/** How extractTargetDate matched the text — coarser patterns are less certain. */
export type TargetDateType = 'day' | 'month' | 'month-range' | 'quarter' | 'year-end';

export interface ExtractedTargetDate {
  /** ISO date (YYYY-MM-DD). Range-like patterns resolve to the period's end. */
  date: string;
  type: TargetDateType;
  /** The exact text fragment the date was extracted from. */
  matched: string;
}

// ── Rows served by our API ───────────────────────────────────────────────────

/** A row from direct_outreach_open_v (open backlog with computed aging). */
export interface OutreachCaseRow {
  case_id: number;
  client_name: string | null;
  client_address: string | null;
  /** Workbook (original) agency. Display and scoping use effective_agency. */
  agency: string | null;
  /** COALESCE(transfer override, workbook agency) — the owning agency. */
  effective_agency: string | null;
  /** True while a transfer override differs from the workbook agency. */
  transferred: boolean;
  status: string | null;
  priority_flag: PriorityFlag | null;
  theme: OutreachTheme | null;
  description: string | null;
  category_name: string | null;
  outreach_location: string | null;
  outreach_date: string | null;
  /** Workbook-owned optional columns (null when the uploaded workbook lacks them). */
  region: string | null;
  point_person: string | null;
  created_at: string | null;
  /** Responsible officer (direct_outreach_assignments LEFT JOIN — survives uploads). */
  assignee_user_id: string | null;
  assignee_name: string | null;
  assigned_at: string | null;
  latest_update: string | null;
  latest_update_date: string | null;
  latest_update_by: string | null;
  comment_count: number;
  /** Null when the source case has no created_at (age_bucket = 'Unknown'). */
  days_open: number | null;
  days_idle: number | null;
  age_bucket: string;
  committed_date: string | null;
  committed_source: string | null;
  committed_by: string | null;
  committed_overdue: boolean;
  // ── v3 officer-driven fields (view v4, migration 151) ──────────────────────
  working_status: OutreachWorkingStatus;
  /** Explicit officer commitment — survives uploads, outranks the heuristic. */
  officer_target_date: string | null;
  officer_target_overdue: boolean;
  /** COALESCE(officer target, auto-detected committed_date). */
  effective_target_date: string | null;
  effective_target_overdue: boolean;
  last_officer_update_at: string | null;
  /** Guyana days since GREATEST(last officer update, assigned_at); NULL only
   *  when the case is unassigned AND never updated ("most neglected"). */
  days_since_officer_action: number | null;
}

/** Full case detail (any status) + computed aging. */
export interface OutreachCaseDetail extends OutreachCaseRow {
  client_phone: string | null;
  public_servant: string | null;
  unclassified_category: string | null;
  creator: string | null;
  synced_at: string | null;
  assignee_agency: string | null;
}

/** One row of the append-only agency-transfer audit. */
export interface OutreachTransfer {
  id: number;
  case_id: number;
  from_agency: string | null;
  to_agency: string;
  cleared_assignee_user_id: string | null;
  reason: string;
  transferred_by: string | null;
  transferred_by_name: string | null;
  transferred_at: string;
}

export interface OutreachUpdate {
  entry_ref: number;
  case_id: number;
  agency: string | null;
  creator_agency: string | null;
  status: string | null;
  comment: string | null;
  username: string | null;
  created_at: string | null;
}

// ── Summary payload ──────────────────────────────────────────────────────────

export interface OutreachAgencySummary {
  agency: string;
  total: number;
  resolved: number;
  open: number;
  /** resolved / total, 0-100. Null when the agency has no cases. */
  resolution_rate: number | null;
  stalled_60: number;
  stalled_90: number;
  /** Open cases whose EFFECTIVE target (officer > heuristic) is past (Q4). */
  overdue_commitments: number;
  with_target: number;
  /** Open cases owned via a transfer override (amendment B legibility count). */
  transferred_in: number;
  // ── v3 accountability counts ────────────────────────────────────────────
  unassigned: number;
  /** days_since_officer_action > OUTREACH_STALE_OFFICER_DAYS. */
  stale_officer: number;
  /** Officer-set target date past (strict — heuristic dates excluded). */
  officer_overdue: number;
}

/** Per-officer accountability rollup over their assigned open cases. */
export interface OutreachOfficerLoad {
  id: string;
  name: string | null;
  agency: string | null;
  open_cases: number;
  stale_cases: number;
  overdue_commitments: number;
  /** Newest update AUTHORED by this officer (strict per-author). */
  last_update_at: string | null;
}

export interface OutreachSummary {
  totals: {
    total: number;
    resolved: number;
    open: number;
    resolution_rate: number | null;
    stalled_60: number;
    stalled_90: number;
    overdue_commitments: number;
    with_target: number;
    transferred_in: number;
    unassigned_open: number;
    /** Assigned-or-updated open cases with no officer activity in >14d. */
    stale_officer: number;
    /** Open cases whose officer-set target date is past. */
    officer_overdue: number;
  };
  agencies: OutreachAgencySummary[];
  /** Per-officer workload strip (scoped like everything else). */
  officer_load: OutreachOfficerLoad[];
  /** Scoped option sources for the filter dropdowns. */
  filter_options: {
    regions: string[];
    outreach_locations: string[];
    officers: { id: string; name: string | null }[];
  };
  last_synced_at: string | null;
  cases_seen: number | null;
  updates_seen: number | null;
}

// ── List filters ─────────────────────────────────────────────────────────────

export type OutreachSortField =
  | 'case_id'
  | 'agency'
  | 'status'
  | 'theme'
  | 'days_idle'
  | 'days_open'
  | 'latest_update_date'
  | 'target_date'
  | 'assignee'
  | 'working_status'
  | 'officer_update';

/** Default sort (Q6): officer-action staleness, most neglected first —
 *  unassigned-and-untouched (NULL) cases sort to the TOP, then stalest. */
export const OUTREACH_DEFAULT_SORT: OutreachSortField = 'officer_update';

/** Sentinel accepted in `officers` alongside user uuids. */
export const UNASSIGNED_OFFICER = 'unassigned';

export interface OutreachListFilters {
  /** Multi-selects — all AND-combined; agency values compare against effective_agency. */
  agencies?: string[];
  statuses?: string[];
  themes?: string[];
  outreaches?: string[];
  regions?: string[];
  /** Officer uuids; may include the UNASSIGNED_OFFICER sentinel. */
  officers?: string[];
  /** Session user id, resolved by the route from the "Assigned to me" toggle. */
  assignedToMe?: string;
  /** v3: internal working-status multi-select. */
  workingStatuses?: string[];
  /** Independent toggles (replace the old single-select backlog view). */
  highPriority?: boolean;
  stalled60?: boolean;
  stalled90?: boolean;
  /** Effective target exists (officer-set or auto-detected) — Q4 semantics. */
  hasTarget?: boolean;
  /** Effective target past — Q4 semantics. */
  overdue?: boolean;
  /** No officer activity in >OUTREACH_STALE_OFFICER_DAYS (NULLs excluded —
   *  those are unassigned-and-untouched, caught by officers=unassigned). */
  staleOfficer?: boolean;
  /** Officer-set target date past (strict). */
  officerOverdue?: boolean;
  search?: string;
  sort?: OutreachSortField;
  sort_dir?: 'asc' | 'desc';
}

/** Returned by the workbook upload (full snapshot replace). */
export interface OutreachUploadSummary {
  cases: number;
  updates: number;
  open: number;
  resolved: number;
  /** Distinct Agency values outside OUTREACH_AGENCIES (stored verbatim but
   *  surfaced so a typo'd workbook is visible instead of silently bucketed). */
  unrecognized_agencies: string[];
}
