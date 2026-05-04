// Action Items — locked constants (spec §3, §4.1, §4.2, §6.4, §11.5)
//
// Every CHECK constraint in migration 102 has a counterpart here. When a
// constraint changes, both the SQL and this file move together. Tests in
// lib/__tests__/action-items-constants.test.ts enforce the invariants.

export const AGENCIES = [
  'GPL', 'GWI', 'GCAA', 'CJIA', 'MARAD', 'HCI', 'HA',
  'MPUA-DG', 'MPUA-Minister', 'MPUA-PS',
] as const;
export type Agency = (typeof AGENCIES)[number];

export const MEETING_TYPES = ['internal', 'agency', 'external'] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MODALITIES = ['virtual', 'in_person', 'mixed'] as const;
export type Modality = (typeof MODALITIES)[number];

export const ITEM_STATUSES = [
  'open', 'in_progress', 'awaiting_verification',
  'complete', 'cancelled', 'superseded', 'disputed',
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const REVIEW_STATUSES = [
  'pending', 'in_review', 'complete', 'skipped', 'failed',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const PIPELINE_ACTIONS = [
  'extracted', 'skipped_out_of_scope', 'queued', 'failed', 'manually_processed',
] as const;
export type PipelineAction = (typeof PIPELINE_ACTIONS)[number];

export const VERB_CATEGORIES = [
  'correspondence', 'decision', 'information',
  'scheduling', 'project_update', 'analysis',
] as const;
export type VerbCategory = (typeof VERB_CATEGORIES)[number];

export const APPROVED_VERBS: Record<VerbCategory, readonly string[]> = {
  correspondence: ['write', 'issue', 'send', 'draft', 'publish', 'distribute'],
  decision:       ['approve', 'sign', 'authorize', 'clear', 'reject'],
  information:    ['obtain', 'verify', 'confirm', 'report', 'investigate'],
  scheduling:     ['schedule', 'convene', 'arrange', 'coordinate'],
  project_update: ['update', 'submit', 'mark', 'close', 'reopen'],
  analysis:       ['calculate', 'analyze', 'assess', 'compare', 'evaluate'],
};

export const BANNED_PHRASES = [
  'follow up on',
  'follow up with',
  'touch base',
  'circle back',
  'look into',
  // 'address the issue of' excluded: contains approved verb "issue" as a whole
  // word, which would fail the test invariant. The validator (Plan 4) handles
  // this pattern via standalone-token matching instead.
  // 'handle' and 'work on' are excluded from the substring list because they
  // contain no approved-verb collisions and are matched as standalone tokens
  // by the validator (Plan 4) — keeping them here as substrings would block
  // legitimate sentences like "investigate handle valves".
] as const;
export type BannedPhrase = (typeof BANNED_PHRASES)[number];

export const SAFETY_KEYWORDS = [
  'safety', 'fire', 'accident', 'fatality', 'injury', 'hazard',
  'evacuation', 'emergency', 'outage', 'blackout', 'spill', 'contamination',
] as const;

export const CLOSURE_MODES = ['self_close', 'dg_managed'] as const;
export type ClosureMode = (typeof CLOSURE_MODES)[number];

export const VISIBILITY_SCOPES = ['agency_normal', 'dg_only'] as const;
export type VisibilityScope = (typeof VISIBILITY_SCOPES)[number];

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const FAILURE_REASONS = [
  'claude_error', 'malformed_json', 'transcript_unavailable',
  'speaker_collapse_virtual', 'transcript_partial', 'quota_exceeded', 'other',
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

export const EVENT_TYPES = [
  'created', 'accepted', 'edited', 'rejected', 'status_change',
  'dispute_raised', 'dispute_resolved', 'superseded_by', 'supersedes',
  'attribution_error_flagged',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
