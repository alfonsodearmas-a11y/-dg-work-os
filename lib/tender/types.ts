// ── Canonical tender types (procurement reformulation) ───────────────────────

import type {
  TenderAgency,
  TenderStage,
  TenderMethod,
  TenderStageSource,
} from '@/lib/psip/types';

export type { TenderAgency, TenderStage, TenderMethod, TenderStageSource };

export type TenderSource = 'psip' | 'trello' | 'manual';

// ── Pipeline constants ────────────────────────────────────────────────────────

export const TENDER_STAGES: readonly TenderStage[] = [
  'design',
  'advertised',
  'evaluation',
  'awaiting_award',
  'award',
] as const;

// Stages shown on the default /procurement board and list view. The
// `award` stage lives in /procurement/archive instead — the landing
// surface is about active procurement, not completed awards.
export const KANBAN_STAGES: readonly TenderStage[] = [
  'design',
  'advertised',
  'evaluation',
  'awaiting_award',
] as const;

export const STAGE_CONFIG: Record<TenderStage, { label: string; color: string; description: string }> = {
  design:         { label: 'Design',         color: '#94a3b8', description: 'Not yet advertised; planning stage' },
  advertised:     { label: 'Advertised',     color: '#60a5fa', description: 'Tender advertised publicly' },
  evaluation:     { label: 'Evaluation',     color: '#d4af37', description: 'Bids under evaluation' },
  awaiting_award: { label: 'Awaiting Award', color: '#34d399', description: 'Evaluation submitted to MTB/RTB/NPTAB' },
  award:          { label: 'Award',          color: '#10b981', description: 'Contract awarded' },
};

export const METHOD_CONFIG: Record<TenderMethod, { label: string }> = {
  open_tender:        { label: 'Open Tender' },
  quotation:          { label: 'Quotation' },
  sole_source:        { label: 'Sole Source' },
  restrictive:        { label: 'Restrictive' },
  comm_participation: { label: 'Community Participation' },
};

export const AGENCY_LABEL: Record<TenderAgency, string> = {
  MPUA: 'Ministry of Public Utilities and Aviation',
  GPL: 'Guyana Power & Light',
  GWI: 'Guyana Water Inc.',
  CJIA: 'Cheddi Jagan International Airport',
  GCAA: 'Guyana Civil Aviation Authority',
  MARAD: 'Maritime Administration Department',
  HINTERLAND_AIRSTRIPS: 'Hinterland Airstrips',
  HECI: 'Hinterland Electrification Company Inc.',
};

export const AGENCY_SHORT: Record<TenderAgency, string> = {
  MPUA: 'MPUA',
  GPL: 'GPL',
  GWI: 'GWI',
  CJIA: 'CJIA',
  GCAA: 'GCAA',
  MARAD: 'MARAD',
  HINTERLAND_AIRSTRIPS: 'Hinterland Airstrips',
  HECI: 'HECI',
};

export const AGENCY_CODES: TenderAgency[] = [
  'MPUA', 'GPL', 'GWI', 'HECI', 'CJIA', 'GCAA', 'MARAD', 'HINTERLAND_AIRSTRIPS',
];

// ── Archive vocabulary ────────────────────────────────────────────────────────

export const ARCHIVE_REASON_CODES = [
  'withdrawn',
  'completed_outside_psip',
  'agency_error',
  'superseded',
] as const;
export type ArchiveReasonCode = typeof ARCHIVE_REASON_CODES[number];

export const ARCHIVE_REASON_LABELS: Record<ArchiveReasonCode, string> = {
  withdrawn: 'Withdrawn',
  completed_outside_psip: 'Completed (off PSIP)',
  agency_error: 'Agency error',
  superseded: 'Superseded',
};

// ── Entity interfaces ─────────────────────────────────────────────────────────

export interface Tender {
  id: string;
  source: TenderSource;
  external_id: string | null;
  description: string;
  agency: TenderAgency;
  programme_code: string | null;
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
  missing_from_last_upload: boolean;
  first_seen_upload_id: string | null;
  last_seen_upload_id: string | null;
  awarded_at: string | null;
  first_appearance_already_awarded: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Soft archive
  archived_at: string | null;
  archived_by: string | null;
  archived_role: string | null;
  archive_reason_code: ArchiveReasonCode | null;
  archive_reason_text: string | null;
  // Derived
  agency_name: string;
  days_at_current_stage: number | null;
  // Optional source-specific enrichment
  trello_url?: string | null;
}

export interface TenderFieldChange {
  id: string;
  tender_id: string;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  upload_id: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
}

export interface TenderDocument {
  id: string;
  tender_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  uploaded_by: string;
  uploaded_by_name: string;
  uploaded_at: string;
}

export interface TenderNote {
  id: string;
  tender_id: string;
  content: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
}

export interface Upload {
  id: string;
  filename: string;
  storage_path: string;
  uploaded_at: string;
  uploaded_by: string;
  uploaded_by_name: string;
  status: 'preview' | 'applied' | 'cancelled';
  stats: Record<string, number>;
  applied_at: string | null;
  cancelled_at: string | null;
}

export interface TenderMatchReviewRow {
  id: string;
  upload_id: string;
  incoming_row: Record<string, unknown>;
  candidates: Array<{ tender_id: string; score: number; description: string }>;
  status: 'pending' | 'matched' | 'created' | 'skipped';
  resolution_tender_id: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface PipelineStats {
  total_active: number;
  total_count: number;
  avg_days_to_award: number;
  stalled_count: number;
  by_stage: Record<TenderStage, { count: number }>;
}
