import { describe, it, expect } from 'vitest';
import {
  AGENCIES,
  MEETING_TYPES,
  MODALITIES,
  TASK_STATUSES,
  REVIEW_STATUSES,
  PIPELINE_ACTIONS,
  VERB_CATEGORIES,
  APPROVED_VERBS,
  BANNED_PHRASES,
  SAFETY_KEYWORDS,
  CLOSURE_MODES,
  VISIBILITY_SCOPES,
  PRIORITIES,
  LEGACY_TASK_PRIORITIES,
  FAILURE_REASONS,
  EVENT_TYPES,
} from '@/lib/action-items/constants';

describe('action-items constants', () => {
  it('exports the 10 agency enum values', () => {
    expect(AGENCIES).toEqual([
      'GPL','GWI','GCAA','CJIA','MARAD','HECI','HAS',
      'MPUA-DG','MPUA-Minister','MPUA-PS',
    ]);
  });

  it('exports the 3 meeting types and 3 modalities', () => {
    expect(MEETING_TYPES).toEqual(['internal','agency','external']);
    expect(MODALITIES).toEqual(['virtual','in_person','mixed']);
  });

  it('exports the 6 task statuses including awaiting_verification and superseded', () => {
    expect(TASK_STATUSES).toEqual([
      'new','active','blocked','done',
      'awaiting_verification','superseded',
    ]);
  });

  it('approved verbs may appear in multiple categories', () => {
    // Verbs like "send", "distribute", "investigate" intentionally belong to
    // more than one category — Claude picks the category based on intent and
    // the validator only checks (verb, category) membership. Spec §6.1.
    // This test asserts the data shape (every entry is a non-empty lowercase
    // string) rather than uniqueness.
    for (const [, verbs] of Object.entries(APPROVED_VERBS)) {
      expect(verbs.length).toBeGreaterThan(0);
      for (const v of verbs) {
        expect(typeof v).toBe('string');
        expect(v.length).toBeGreaterThan(0);
        expect(v).toBe(v.toLowerCase());
      }
    }
  });

  it('approved verbs cover all 6 verb categories', () => {
    expect(Object.keys(APPROVED_VERBS).sort()).toEqual([...VERB_CATEGORIES].sort());
  });

  it('no banned phrase contains an approved verb as a whole word', () => {
    const allApproved = Object.values(APPROVED_VERBS).flat();
    for (const phrase of BANNED_PHRASES) {
      for (const verb of allApproved) {
        const re = new RegExp(`\\b${verb}\\b`, 'i');
        expect(re.test(phrase),
          `banned phrase "${phrase}" contains approved verb "${verb}"`).toBe(false);
      }
    }
  });

  it('safety keywords are lowercase and non-empty', () => {
    for (const kw of SAFETY_KEYWORDS) {
      expect(kw).toBe(kw.toLowerCase());
      expect(kw.length).toBeGreaterThan(0);
    }
  });

  it('closure_modes, visibility_scopes, priorities exact values', () => {
    expect(CLOSURE_MODES).toEqual(['self_close','dg_managed']);
    expect(VISIBILITY_SCOPES).toEqual(['agency_normal','dg_only']);
    expect(PRIORITIES).toEqual(['P0','P1','P2','P3']);
    expect(LEGACY_TASK_PRIORITIES).toEqual(['low','medium','high','critical']);
  });

  it('review_statuses and pipeline_actions match schema CHECK constraints', () => {
    expect(REVIEW_STATUSES).toEqual(['pending','in_review','complete','skipped','failed']);
    expect(PIPELINE_ACTIONS).toEqual([
      'extracted','skipped_out_of_scope','queued','failed','manually_processed',
    ]);
  });

  it('failure_reasons and event_types match schema CHECK constraints', () => {
    expect(FAILURE_REASONS).toEqual([
      'claude_error', 'malformed_json', 'transcript_unavailable',
      'speaker_collapse_virtual', 'transcript_partial', 'quota_exceeded', 'other',
    ]);
    expect(EVENT_TYPES).toEqual([
      'created', 'accepted', 'edited', 'rejected', 'status_change',
      'dispute_raised', 'dispute_resolved', 'superseded_by', 'supersedes',
      'attribution_error_flagged',
    ]);
  });
});
