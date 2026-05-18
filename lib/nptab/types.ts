export const NPTAB_REPORT_STATUSES = ['drafted', 'submitted', 'closed'] as const;
export const NPTAB_DELIVERY_METHODS = ['email', 'hand_delivered', 'in_meeting', 'other'] as const;

export type NptabReportStatus = (typeof NPTAB_REPORT_STATUSES)[number];
export type NptabDeliveryMethod = (typeof NPTAB_DELIVERY_METHODS)[number];

export interface NptabReport {
  id: string;
  reference_number: string | null;
  period_start: string;
  period_end: string;
  generated_at: string;
  generated_by: string;
  status: NptabReportStatus;
  submitted_at: string | null;
  delivery_method: NptabDeliveryMethod | null;
  delivered_to: string | null;
  narrative: string;
  tender_count: number;
  total_value: number | null;
  closed_at: string | null;
  closure_reason: string | null;
  updated_at: string;
}

export interface NptabQueueRow {
  id: string;
  tender_id: string;
  queued_at: string;
  queued_by: string;
  reason: string | null;
  dequeued_at: string | null;
  dequeued_by: string | null;
  dequeue_reason: string | null;
  included_in_report_id: string | null;
}

export interface NptabAuditEntry {
  id: string;
  report_id: string;
  changed_by: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  timestamp: string;
}

export interface NptabReportTenderSnapshot {
  tender_id: string;
  title: string;
  agency: string;
  contract_value: number | null;
  days_past_sla: number | null;
  contractor: string | null;
  status: string;
}

export interface NptabQueueRowWithTender {
  id: string;
  tender_id: string;
  queued_at: string;
  queued_by: string;
  queued_by_name: string | null;
  reason: string | null;
  tender_title: string | null;
  tender_agency: string | null;
  contract_value: number | null;
  days_past_sla: number | null;
  contractor: string | null;
}

export const NPTAB_STATUS_LABELS: Record<NptabReportStatus, string> = {
  drafted: 'Drafted',
  submitted: 'Submitted',
  closed: 'Closed',
};

export const NPTAB_DELIVERY_LABELS: Record<NptabDeliveryMethod, string> = {
  email: 'Email',
  hand_delivered: 'Hand Delivered',
  in_meeting: 'In Meeting',
  other: 'Other',
};
