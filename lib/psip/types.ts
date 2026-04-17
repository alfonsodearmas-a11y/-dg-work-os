// ── PSIP parser shared types ──────────────────────────────────────────────────

export type TenderStage =
  | 'design'
  | 'advertised'
  | 'evaluation'
  | 'awaiting_award'
  | 'award';

export type TenderMethod =
  | 'open_tender'
  | 'quotation'
  | 'sole_source'
  | 'restrictive'
  | 'comm_participation';

export type TenderAgency =
  | 'MPUA'
  | 'GPL'
  | 'GWI'
  | 'CJIA'
  | 'GCAA'
  | 'MARAD'
  | 'HINTERLAND_AIRSTRIPS'
  | 'HECI';

export type TenderStageSource =
  | 'status_column'
  | 'inferred_from_dates'
  | 'manual_override';

/** Parsed row destined for the DB, before identity resolution. */
export interface ParsedTender {
  row_number: number; // 1-based sheet row for traceability
  description: string;
  agency: TenderAgency;
  programme_code: string;
  sub_programme_code: string | null;
  programme_activity: string | null;
  line_item_code: string | null;
  stage: TenderStage;
  stage_source: TenderStageSource;
  method: TenderMethod | null;
  is_rollover: boolean;
  has_exception: boolean;
  date_advertised: string | null;
  date_closed: string | null;
  date_eval_sent_mtb_rtb: string | null;
  date_eval_sent_nptab: string | null;
  date_of_award: string | null;
  contractor: string | null;
  implementation_start_date: string | null;
  implementation_end_date: string | null;
  implementation_status_pct: number | null;
  remarks: string | null;
  raw_row: Record<string, string | number | null>;
  // Set when col J is blank AND all date columns are blank AND the row has
  // a valid description + Open/Public method. These rows are routed to the
  // review queue with review_reason='ambiguous_stage' rather than silently
  // defaulted to Design. See docs/procurement-audit-and-rebuild-plan.md §11-1.
  needs_stage_review?: boolean;
}

export type ReviewReason = 'ambiguous_match' | 'ambiguous_stage';

export interface ParseStats {
  total_rows_scanned: number;
  tenders_parsed: number;
  excluded_lethem_heci: number;
  programme_header_dupes: number;
  skipped_nil_method: number;
  skipped_dividers: number;
  skipped_summary_rollup: number;
  excluded_method_filter: number;
  queued_for_stage_review: number;
  normalized_public_tender: number;
  normalized_lowercase_award: number;
  stages_inferred_from_dates: number;
  parents_collapsed_children: number;
  parents_self_as_tender: number;
}

export interface ParseResult {
  tenders: ParsedTender[];
  stats: ParseStats;
  warnings: string[];
}

/** A row staged for match-review by a human (ambiguous fuzzy match). */
export interface ReviewRow {
  incoming: ParsedTender;
  candidates: Array<{ tender_id: string; score: number; description: string }>;
  top_score: number;
}

export type MatchResultKind = 'new' | 'update' | 'review';

export interface MatchResult {
  kind: MatchResultKind;
  incoming: ParsedTender;
  existing_tender_id?: string;
  score?: number;
  candidates?: Array<{ tender_id: string; score: number; description: string }>;
  field_diffs?: Array<{ field: string; old: unknown; new: unknown }>;
  review_reason?: ReviewReason;
}

export interface MatchStats {
  new: number;
  updated: number;
  updated_field_changes: number;
  review_queue: number;
  review_queue_ambiguous_match: number;
  review_queue_ambiguous_stage: number;
  high_confidence_matches: number;
  missing: number;
}
