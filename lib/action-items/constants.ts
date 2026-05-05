// Action Items — locked constants (spec §3, §4.1, §4.2, §6.4, §11.5)
//
// Every CHECK constraint in migration 102 has a counterpart here. When a
// constraint changes, both the SQL and this file move together. Tests in
// lib/__tests__/action-items-constants.test.ts enforce the invariants.

// Production-canonical agency values are LOWERCASE: gpl|gwi|gcaa|cjia|marad|heci|has.
// Earlier drafts used 'HCI'/'HA' — those are wrong. Plan 4 prompts and any new
// extraction writes must emit lowercase. Existing rows in `tasks.agency` are
// mixed-case (legacy); reads should case-fold before comparing.
export const AGENCIES = [
  'gpl', 'gwi', 'gcaa', 'cjia', 'marad', 'heci', 'has',
  'MPUA-DG', 'MPUA-Minister', 'MPUA-PS',
] as const;
export type Agency = (typeof AGENCIES)[number];

export const MEETING_TYPES = ['internal', 'agency', 'external'] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MODALITIES = ['virtual', 'in_person', 'mixed'] as const;
export type Modality = (typeof MODALITIES)[number];

export const TASK_STATUSES = [
  'new', 'active', 'blocked', 'done',
  'awaiting_verification', 'superseded',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

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

// Approved-verb allow-lists were too narrow on first smoke; the prompt v0.2
// change (contiguous quotes, no ellipsis-concatenation) rides with this
// expanded list to match how meetings actually use English. Spec §6.1.
export const APPROVED_VERBS: Record<VerbCategory, readonly string[]> = {
  correspondence: ['write', 'issue', 'send', 'draft', 'publish', 'distribute',
                   'email', 'call', 'message', 'contact', 'reply', 'respond'],
  decision:       ['approve', 'sign', 'authorize', 'clear', 'reject',
                   'decide', 'choose', 'incorporate', 'adopt', 'accept'],
  information:    ['obtain', 'verify', 'confirm', 'report', 'investigate',
                   'provide', 'share', 'send', 'distribute', 'enter', 'input', 'post'],
  scheduling:     ['schedule', 'convene', 'arrange', 'coordinate',
                   'book', 'set', 'plan', 'defer', 'postpone'],
  project_update: ['update', 'submit', 'mark', 'close', 'reopen',
                   'upload', 'deploy', 'complete', 'deliver', 'provide'],
  analysis:       ['calculate', 'analyze', 'assess', 'compare', 'evaluate',
                   'review', 'examine', 'audit', 'investigate', 'study'],
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
  // Three banned phrases from the spec are NOT in this substring list:
  //   - 'handle' and 'work on' — substring matching would block legitimate
  //     noun-phrase usage ("investigate handle valves", "close the work-on-site
  //     order"). The validator (Plan 4) matches them as sentence-initial
  //     standalone tokens only.
  //   - 'address the issue of' — contains the approved verb 'issue' as a whole
  //     word, which would fire the constants invariant test. The validator
  //     (Plan 4) matches it as a phrase sequence rather than substring.
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

// Legacy tasks.priority enum from migration 029 (low|medium|high|critical, nullable).
// The pipeline's canonical PRIORITIES (P0-P3) are mapped to this scale at extraction.
export const LEGACY_TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type LegacyTaskPriority = (typeof LEGACY_TASK_PRIORITIES)[number];

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
