// Bridge decision rules — idempotency (history marker), status verification,
// comment composition, and run summaries. Pure functions, no browser.

import { describe, expect, it } from 'vitest';
import {
  buildOpComment,
  currentOpStatus,
  findMarkerEntry,
  formatSummary,
  planForRow,
  type OpHistoryEntry,
  type OutboxExportRow,
} from './opdirect-bridge-core';

const ROW: OutboxExportRow = {
  id: '11111111-2222-4333-8444-555555555555',
  case_id: 58244,
  dgos_ref: 'DGOS-11111111-2222-4333-8444-555555555555',
  comment_text: 'Status -> Resolved — pending verification',
  op_status_target: 'Resolved',
  author_label: 'Officer One',
};
const COMMENT_ONLY: OutboxExportRow = { ...ROW, comment_text: 'Crew on site', op_status_target: null };

const entry = (over: Partial<OpHistoryEntry>): OpHistoryEntry => ({
  case_detail_id: 139251,
  status_name: 'Open',
  comment: 'Case created',
  username: 'nalinie.singh',
  created_at: '2026-07-10T17:57:16.911438+00:00',
  ...over,
});

describe('buildOpComment', () => {
  it('is "[dgos_ref] {author}: {comment}" — attribution survives the shared OP login', () => {
    expect(buildOpComment(COMMENT_ONLY)).toBe(`[${ROW.dgos_ref}] Officer One: Crew on site`);
  });
});

describe('currentOpStatus — newest entry wins even when the API order drifts', () => {
  it('sorts by created_at descending, defensively', () => {
    const history = [
      entry({ status_name: 'Open', created_at: '2026-07-01T00:00:00Z' }),
      entry({ status_name: 'Resolved', created_at: '2026-07-11T00:00:00Z' }),
      entry({ status_name: 'Referred', created_at: '2026-07-05T00:00:00Z' }),
    ];
    expect(currentOpStatus(history)).toBe('Resolved');
    expect(currentOpStatus([])).toBeNull();
  });
});

describe('planForRow — the idempotency guard', () => {
  it('no marker → post', () => {
    expect(planForRow(ROW, [entry({})])).toEqual({ action: 'post' });
    expect(planForRow(ROW, [])).toEqual({ action: 'post' });
  });

  it('marker present + comment-only row → ack with the found comment id (no re-post)', () => {
    const history = [
      entry({}),
      entry({ case_detail_id: 140001, comment: `[${ROW.dgos_ref}] Officer One: Crew on site`, created_at: '2026-07-11T01:00:00Z' }),
    ];
    expect(planForRow(COMMENT_ONLY, history)).toEqual({ action: 'ack', opdirectCommentId: '140001' });
  });

  it('marker present + status target already current → ack (resumable after crashed ack)', () => {
    const history = [
      entry({ status_name: 'Open', created_at: '2026-07-01T00:00:00Z' }),
      entry({
        case_detail_id: 140002,
        status_name: 'Resolved',
        comment: `[${ROW.dgos_ref}] Officer One: Status -> Resolved — pending verification`,
        created_at: '2026-07-11T01:00:00Z',
      }),
    ];
    expect(planForRow(ROW, history)).toEqual({ action: 'ack', opdirectCommentId: '140002' });
  });

  it('marker present but OP status has drifted → loud CONFLICT (never re-post/revert)', () => {
    const history = [
      entry({
        case_detail_id: 140002,
        status_name: 'Resolved',
        comment: `[${ROW.dgos_ref}] Officer One: Status -> Resolved — pending verification`,
        created_at: '2026-07-01T00:00:00Z',
      }),
      entry({ status_name: 'Open', comment: 'Reopened by OP', created_at: '2026-07-11T00:00:00Z' }),
    ];
    const plan = planForRow(ROW, history);
    expect(plan.action).toBe('conflict');
    if (plan.action === 'conflict') {
      expect(plan.reason).toContain(ROW.dgos_ref);
      expect(plan.reason).toContain("'Open', not 'Resolved'");
    }
  });

  it('resolved row plan → would set status Resolved + post the comment', () => {
    // The "resolved" contract end to end: fresh history posts, and the payload
    // the bridge would type/select is exactly comment + Status dropdown label.
    expect(planForRow(ROW, [entry({})])).toEqual({ action: 'post' });
    expect(ROW.op_status_target).toBe('Resolved');
    expect(buildOpComment(ROW)).toBe(
      `[${ROW.dgos_ref}] Officer One: Status -> Resolved — pending verification`,
    );
  });
});

describe('findMarkerEntry', () => {
  it('matches on the bracketed ref anywhere in the comment', () => {
    const history = [entry({ comment: `prefix [${ROW.dgos_ref}] suffix` })];
    expect(findMarkerEntry(history, ROW.dgos_ref)).toBeDefined();
    expect(findMarkerEntry(history, 'DGOS-other')).toBeUndefined();
  });
});

describe('formatSummary', () => {
  it('reports posted/skipped/failed with case ids and failure reasons', () => {
    const out = formatSummary([
      { caseId: 1, dgosRef: 'DGOS-a', outcome: 'posted' },
      { caseId: 2, dgosRef: 'DGOS-b', outcome: 'already-posted' },
      { caseId: 3, dgosRef: 'DGOS-c', outcome: 'failed', error: 'Save button not found' },
    ]);
    expect(out).toContain('posted: 1 (cases 1)');
    expect(out).toContain('skipped (already in OP): 1 (cases 2)');
    expect(out).toContain('failed: 1 (cases 3)');
    expect(out).toContain('Save button not found');
  });
});
