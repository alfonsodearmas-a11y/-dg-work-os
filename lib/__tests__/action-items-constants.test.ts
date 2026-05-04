import { describe, it, expect } from 'vitest';
import {
  AGENCIES,
  MEETING_TYPES,
  MODALITIES,
  ITEM_STATUSES,
  REVIEW_STATUSES,
  PIPELINE_ACTIONS,
  VERB_CATEGORIES,
  APPROVED_VERBS,
  BANNED_PHRASES,
  SAFETY_KEYWORDS,
  CLOSURE_MODES,
  VISIBILITY_SCOPES,
  PRIORITIES,
  FAILURE_REASONS,
  EVENT_TYPES,
} from '@/lib/action-items/constants';

describe('action-items constants', () => {
  it('exports the 10 agency enum values', () => {
    expect(AGENCIES).toEqual([
      'GPL','GWI','GCAA','CJIA','MARAD','HCI','HA',
      'MPUA-DG','MPUA-Minister','MPUA-PS',
    ]);
  });

  it('exports the 3 meeting types and 3 modalities', () => {
    expect(MEETING_TYPES).toEqual(['internal','agency','external']);
    expect(MODALITIES).toEqual(['virtual','in_person','mixed']);
  });

  it('exports the 7 item statuses including superseded and disputed', () => {
    expect(ITEM_STATUSES).toEqual([
      'open','in_progress','awaiting_verification',
      'complete','cancelled','superseded','disputed',
    ]);
  });

  it('every approved verb maps to exactly one verb category', () => {
    const seen = new Map<string, string>();
    for (const [cat, verbs] of Object.entries(APPROVED_VERBS)) {
      for (const v of verbs) {
        expect(seen.has(v), `verb "${v}" in two categories`).toBe(false);
        seen.set(v, cat);
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
