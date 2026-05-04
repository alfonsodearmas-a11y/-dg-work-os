import { z } from 'zod';
import {
  AGENCIES, MEETING_TYPES, MODALITIES, ITEM_STATUSES,
  REVIEW_STATUSES, PIPELINE_ACTIONS, VERB_CATEGORIES,
  CLOSURE_MODES, VISIBILITY_SCOPES, PRIORITIES,
  FAILURE_REASONS, EVENT_TYPES,
  type Agency, type MeetingType, type Modality, type ItemStatus,
  type ReviewStatus, type PipelineAction, type VerbCategory,
  type ClosureMode, type VisibilityScope, type Priority,
  type FailureReason, type EventType,
} from './constants';

// ============================================================================
// DB row types — mirror migration 102 column-for-column.
// ============================================================================

export interface ActionItemRow {
  id: string;
  source: 'extraction' | 'manual';
  extraction_id: string | null;
  extraction_item_idx: number | null;
  source_meeting_id: string | null;
  source_timestamp: string | null;
  source_quote: string | null;
  created_by: string | null;

  agency_name: Agency;
  owner_id: string;
  owner_name_raw: string;
  delegated_to_id: string | null;

  verb_category: VerbCategory;
  task: string;
  due_at: string | null;
  due_trigger: string | null;
  priority: Priority;

  status: ItemStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
  completion_note: string | null;
  verified_by: string | null;
  verified_at: string | null;
  disputed_at: string | null;
  dispute_note: string | null;

  supersedes_id: string | null;

  confidence_overall: number | null;
  confidence_reasons: string[] | null;
  task_embedding: number[] | null;

  visibility_scope: VisibilityScope;

  created_at: string;
  updated_at: string;
}

export interface ActionItemExtractionRow {
  id: string;
  meeting_id: string;
  meeting_title: string | null;
  meeting_date: string | null;
  meeting_type: MeetingType;
  modality: Modality;
  meeting_type_overridden: boolean;
  modality_overridden: boolean;
  agency_name: Agency | null;
  transcript_url: string | null;
  transcript_hash: string | null;
  prompt_version: string;
  model: string;
  raw_response: unknown;
  token_count_input: number | null;
  token_count_output: number | null;
  extraction_duration_ms: number | null;
  items_extracted: number;
  items_accepted: number;
  items_edited: number;
  items_rejected: number;
  items_added_manually: number;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ActionItemEventRow {
  id: string;
  item_id: string;
  event_type: EventType;
  actor_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
}

export interface MeetingsSeenRow {
  id: string;
  fireflies_meeting_id: string;
  meeting_title: string | null;
  meeting_date: string | null;
  detected_type: MeetingType | null;
  detected_modality: Modality | null;
  detected_agency_name: Agency | null;
  attendee_emails: string[] | null;
  transcript_ready_at: string | null;
  pipeline_action: PipelineAction;
  skip_reason: string | null;
  extraction_id: string | null;
  observed_at: string;
}

export interface FailedExtractionRow {
  id: string;
  fireflies_meeting_id: string;
  attempted_at: string;
  failure_reason: FailureReason;
  failure_detail: string | null;
  retry_count: number;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface UserStaffFields {
  id: string;
  email: string;
  name: string | null;
  role: 'dg' | 'minister' | 'ps' | 'parl_sec' | 'agency_admin' | 'officer';
  agency: string | null;
  aliases: string[];
  closure_mode: ClosureMode;
  is_agency_head: boolean;
  is_active: boolean;
}

// ============================================================================
// Zod schemas for runtime validation at API boundaries.
// ============================================================================

export const AgencyZ          = z.enum(AGENCIES);
export const MeetingTypeZ     = z.enum(MEETING_TYPES);
export const ModalityZ        = z.enum(MODALITIES);
export const ItemStatusZ      = z.enum(ITEM_STATUSES);
export const ReviewStatusZ    = z.enum(REVIEW_STATUSES);
export const PipelineActionZ  = z.enum(PIPELINE_ACTIONS);
export const VerbCategoryZ    = z.enum(VERB_CATEGORIES);
export const ClosureModeZ     = z.enum(CLOSURE_MODES);
export const VisibilityScopeZ = z.enum(VISIBILITY_SCOPES);
export const PriorityZ        = z.enum(PRIORITIES);
export const FailureReasonZ   = z.enum(FAILURE_REASONS);
export const EventTypeZ       = z.enum(EVENT_TYPES);

// Exported for sibling tasks; downstream plans extend this.
export type {
  Agency, MeetingType, Modality, ItemStatus, ReviewStatus,
  PipelineAction, VerbCategory, ClosureMode, VisibilityScope, Priority,
  FailureReason, EventType,
};
