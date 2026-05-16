export const REFERRAL_SOURCE_TYPES = ['tender', 'project', 'agency_issue', 'other'] as const;
export const REFERRAL_REQUESTED_ACTIONS = ['review', 'decision', 'intervention', 'information'] as const;
export const REFERRAL_STATUSES = ['drafted', 'submitted', 'with_minister', 'direction_given', 'closed'] as const;
export const REFERRAL_DELIVERY_METHODS = ['email', 'hand_delivered', 'in_meeting', 'other'] as const;

export type ReferralSourceType = (typeof REFERRAL_SOURCE_TYPES)[number];
export type ReferralRequestedAction = (typeof REFERRAL_REQUESTED_ACTIONS)[number];
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
export type ReferralDeliveryMethod = (typeof REFERRAL_DELIVERY_METHODS)[number];

export interface Referral {
  id: string;
  created_at: string;
  updated_at: string;
  referred_by: string;
  source_type: ReferralSourceType;
  source_id: string | null;
  agency: string;
  title: string;
  days_overdue: number | null;
  contract_value: number | null;
  background: string;
  current_status: string;
  recommendation: string;
  requested_action: ReferralRequestedAction;
  reference_number: string | null;
  status: ReferralStatus;
  submitted_at: string | null;
  delivery_method: ReferralDeliveryMethod | null;
  delivered_to: string | null;
  delivered_at: string | null;
  minister_direction: string | null;
  direction_logged_at: string | null;
  closed_at: string | null;
  closure_note: string | null;
  minister_acknowledged_at: string | null;
  minister_notes: string | null;
}

export interface ReferralAuditEntry {
  id: string;
  referral_id: string;
  changed_by: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  timestamp: string;
}

export interface ReferralWithReferrer extends Referral {
  referrer_name: string | null;
  referrer_email: string | null;
  referrer_title: string | null;
}

export interface ReferralSummary {
  id: string;
  reference_number: string | null;
  submitted_at: string | null;
  agency: string;
  title: string;
  requested_action: ReferralRequestedAction;
  status: ReferralStatus;
  days_since_submission: number | null;
}

export const REQUESTED_ACTION_LABELS: Record<ReferralRequestedAction, string> = {
  review: 'For Review',
  decision: 'For Decision',
  intervention: 'For Intervention',
  information: 'For Information',
};

export const STATUS_LABELS: Record<ReferralStatus, string> = {
  drafted: 'Drafted',
  submitted: 'Submitted',
  with_minister: 'With Minister',
  direction_given: 'Direction Given',
  closed: 'Closed',
};

export const DELIVERY_METHOD_LABELS: Record<ReferralDeliveryMethod, string> = {
  email: 'Email',
  hand_delivered: 'Hand Delivered',
  in_meeting: 'In Meeting',
  other: 'Other',
};

export const SOURCE_TYPE_LABELS: Record<ReferralSourceType, string> = {
  tender: 'Tender',
  project: 'Project',
  agency_issue: 'Agency Issue',
  other: 'Other',
};
