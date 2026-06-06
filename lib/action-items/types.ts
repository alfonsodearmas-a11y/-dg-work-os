import { z } from 'zod';
import {
  AGENCIES, MEETING_TYPES, MODALITIES, TASK_STATUSES,
  REVIEW_STATUSES, PIPELINE_ACTIONS, VERB_CATEGORIES,
  CLOSURE_MODES, VISIBILITY_SCOPES, PRIORITIES, LEGACY_TASK_PRIORITIES,
  FAILURE_REASONS, EVENT_TYPES,
  type Agency, type MeetingType, type Modality, type TaskStatus,
  type ReviewStatus, type PipelineAction, type VerbCategory,
  type ClosureMode, type VisibilityScope, type Priority, type LegacyTaskPriority,
  type FailureReason, type EventType,
} from './constants';

// ============================================================================
// DB row types — mirror migration 102 + the existing tasks columns from
// migrations 022 / 029. The canonical commitment record is `tasks`; this
// project widens it. `ActionItemEventRow` and the others mirror new tables.
// ============================================================================

/**
 * The Task row as it exists AFTER migration 102 — i.e., the existing tasks
 * columns plus the extension columns added by this project.
 *
 * Note: `tasks.priority` is the existing low|medium|high|critical enum from
 * migration 029. Internal P-tier values (P0–P3) are mapped to this scale at
 * extraction time per spec §6.5.
 */
export interface TaskWithExtensions {
  // Existing tasks columns (migration 022 + 029)
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: LegacyTaskPriority | null;  // tasks.priority from migration 029 (low|medium|high|critical, nullable)
  due_date: string | null;          // DATE
  agency: string | null;            // freeform; canonical enum used by extraction
  role: string | null;
  owner_user_id: string;
  assigned_by_user_id: string | null;
  source_meeting_id: string | null; // existed pre-migration as UUID; widened to TEXT below
  blocked_reason: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;

  // Migration 102 extension columns
  source: 'manual' | 'extraction';
  extraction_id: string | null;
  extraction_item_idx: number | null;
  source_timestamp: string | null;
  source_quote: string | null;
  owner_name_raw: string | null;
  delegated_to_id: string | null;
  verb_category: VerbCategory | null;
  due_trigger: string | null;
  confidence_overall: number | null;
  confidence_reasons: string[] | null;
  task_embedding: number[] | null;

  completion_note: string | null;
  completed_by: string | null;
  verified_by: string | null;
  verified_at: string | null;
  dispute_note: string | null;
  disputed_at: string | null;

  supersedes_id: string | null;
  visibility_scope: VisibilityScope;
}

/**
 * Canonical pipeline priority (P0-P3). Mapped to LegacyTaskPriority at extraction
 * write time per spec §6.5. Distinct from `TaskWithExtensions.priority`, which is
 * the on-disk legacy enum.
 */
export type TaskPriority = Priority;

export interface ActionItemExtractionRow {
  id: string;
  meeting_id: string;
  meeting_title: string | null;
  meeting_date: string | null;
  meeting_type: MeetingType;
  modality: Modality;
  meeting_type_overridden: boolean;
  modality_overridden: boolean;
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
  task_id: string;                  // renamed from item_id (rev b)
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
  role: 'superadmin' | 'agency_manager';
  agency: string | null;
  aliases: string[];
  closure_mode: ClosureMode;
  is_agency_head: boolean;
  is_active: boolean;
}

// ============================================================================
// Zod schemas
// ============================================================================

export const AgencyZ          = z.enum(AGENCIES);
export const MeetingTypeZ     = z.enum(MEETING_TYPES);
export const ModalityZ        = z.enum(MODALITIES);
export const TaskStatusZ      = z.enum(TASK_STATUSES);
export const ReviewStatusZ    = z.enum(REVIEW_STATUSES);
export const PipelineActionZ  = z.enum(PIPELINE_ACTIONS);
export const VerbCategoryZ    = z.enum(VERB_CATEGORIES);
export const ClosureModeZ     = z.enum(CLOSURE_MODES);
export const VisibilityScopeZ = z.enum(VISIBILITY_SCOPES);
export const PriorityZ            = z.enum(PRIORITIES);
export const LegacyTaskPriorityZ  = z.enum(LEGACY_TASK_PRIORITIES);
export const FailureReasonZ       = z.enum(FAILURE_REASONS);
export const EventTypeZ       = z.enum(EVENT_TYPES);

export type {
  Agency, MeetingType, Modality, TaskStatus, ReviewStatus,
  PipelineAction, VerbCategory, ClosureMode, VisibilityScope, Priority, LegacyTaskPriority,
  FailureReason, EventType,
};
