// ── Procurement Tracking Types ─────────────────────────────────────────────

// -- Stage & method enums ---------------------------------------------------

export type ProcurementStage =
  | 'pre_advertisement'
  | 'advertised'
  | 'evaluation'
  | 'no_objection'
  | 'awarded';

export type ProcurementMethod =
  | 'open_tender'
  | 'selective_tender'
  | 'sole_source'
  | 'request_for_quotation';

// -- Pipeline constants -----------------------------------------------------

export const PROCUREMENT_STAGES = [
  'pre_advertisement',
  'advertised',
  'evaluation',
  'no_objection',
  'awarded',
] as const;

export const STAGE_CONFIG: Record<
  ProcurementStage,
  { label: string; color: string; description: string }
> = {
  pre_advertisement: { label: 'Pre-Advertisement Review', color: '#94a3b8', description: 'Ministry review before advertisement' },
  advertised:        { label: 'Advertised',               color: '#60a5fa', description: 'Tender advertised publicly' },
  evaluation:        { label: 'Evaluation',               color: '#d4af37', description: 'Bids under evaluation' },
  no_objection:      { label: 'No-Objection',             color: '#34d399', description: 'Awaiting no-objection clearance' },
  awarded:           { label: 'Awarded',                  color: '#10b981', description: 'Contract awarded' },
};

export const METHOD_CONFIG: Record<ProcurementMethod, { label: string }> = {
  open_tender:           { label: 'Open Tender' },
  selective_tender:      { label: 'Selective Tender' },
  sole_source:           { label: 'Sole Source' },
  request_for_quotation: { label: 'Request for Quotation' },
};

// -- Entity interfaces ------------------------------------------------------

export interface ProcurementPackage {
  id: string;
  agency: string;
  title: string;
  nptab_number: string | null;
  description: string | null;
  estimated_value: number;
  procurement_method: ProcurementMethod;
  current_stage: ProcurementStage;
  submitted_by: string;
  oversight_project_id: string | null;
  expected_delivery_date: string | null;
  created_at: string;
  updated_at: string;
  // Computed / joined fields
  agency_name: string;
  submitted_by_name: string;
  days_at_current_stage: number;
  // Trello-sourced items
  is_trello?: boolean;
  trello_url?: string | null;
  trello_labels?: { id: string; name: string; color: string | null }[];
  trello_attachments_count?: number;
  trello_comments_count?: number;
}

export interface ProcurementStageHistory {
  id: string;
  package_id: string;
  from_stage: ProcurementStage | null;
  to_stage: ProcurementStage;
  changed_by: string;
  changed_at: string;
  notes: string | null;
  // Joined
  changed_by_name: string;
}

export interface ProcurementDocument {
  id: string;
  package_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  uploaded_by: string;
  uploaded_at: string;
  // Joined
  uploaded_by_name: string;
}

export interface ProcurementNote {
  id: string;
  package_id: string;
  content: string;
  created_by: string;
  created_at: string;
  // Joined
  created_by_name: string;
}

// -- Analytics --------------------------------------------------------------

export interface PipelineStats {
  total_active: number;
  total_value: number;
  avg_days_to_award: number;
  stalled_count: number;
  by_stage: Record<ProcurementStage, { count: number; total_value: number }>;
}
