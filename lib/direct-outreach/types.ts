// Direct Outreach — shared types. Client-safe: types only, no server imports
// (mirrors the lib/calendar-types.ts client/server boundary pattern).

/** OP Direct agencies. PUA = ministry-level (Public Utilities and Aviation). */
export type OutreachAgency = 'GPL' | 'GWI' | 'PUA';

export const OUTREACH_AGENCIES: OutreachAgency[] = ['GWI', 'GPL', 'PUA'];

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
  agency: string | null;
  status: string | null;
  priority_flag: PriorityFlag | null;
  theme: OutreachTheme | null;
  description: string | null;
  category_name: string | null;
  outreach_location: string | null;
  outreach_date: string | null;
  created_at: string | null;
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
}

/** Full case detail (any status) + computed aging. */
export interface OutreachCaseDetail extends OutreachCaseRow {
  client_phone: string | null;
  public_servant: string | null;
  unclassified_category: string | null;
  creator: string | null;
  synced_at: string | null;
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
  overdue_commitments: number;
  with_target: number;
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
  };
  agencies: OutreachAgencySummary[];
  last_synced_at: string | null;
  cases_seen: number | null;
  updates_seen: number | null;
}

// ── List filters ─────────────────────────────────────────────────────────────

export type BacklogFilter = 'all' | 'stalled60' | 'stalled90' | 'target' | 'overdue';

export type OutreachSortField =
  | 'case_id'
  | 'agency'
  | 'status'
  | 'theme'
  | 'days_idle'
  | 'days_open'
  | 'latest_update_date'
  | 'committed_date';

export interface OutreachListFilters {
  agency?: string;
  status?: string;
  theme?: string;
  backlog?: BacklogFilter;
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
}
