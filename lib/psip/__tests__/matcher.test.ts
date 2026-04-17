import { describe, it, expect } from 'vitest';
import { matchTenders, type ExistingTenderSnapshot } from '@/lib/psip/matcher';
import type { ParsedTender, TenderAgency, TenderStage } from '@/lib/psip/types';

function baseParsed(overrides: Partial<ParsedTender> = {}): ParsedTender {
  return {
    row_number: 1,
    description: 'Supply and installation of transformers',
    agency: 'GPL' as TenderAgency,
    programme_code: '342',
    sub_programme_code: '2611300',
    programme_activity: null,
    line_item_code: null,
    stage: 'design' as TenderStage,
    stage_source: 'status_column',
    method: 'open_tender',
    is_rollover: false,
    has_exception: false,
    date_advertised: null,
    date_closed: null,
    date_eval_sent_mtb_rtb: null,
    date_eval_sent_nptab: null,
    date_of_award: null,
    contractor: null,
    implementation_start_date: null,
    implementation_end_date: null,
    implementation_status_pct: null,
    remarks: null,
    raw_row: {},
    ...overrides,
  };
}

function baseSnapshot(overrides: Partial<ExistingTenderSnapshot> = {}): ExistingTenderSnapshot {
  return {
    id: 'abc-123',
    source: 'psip',
    description: 'Supply and installation of transformers',
    agency: 'GPL',
    programme_code: '342',
    sub_programme_code: '2611300',
    programme_activity: null,
    line_item_code: null,
    stage: 'design',
    stage_source: 'status_column',
    method: 'open_tender',
    is_rollover: false,
    has_exception: false,
    date_advertised: null,
    date_closed: null,
    date_eval_sent_mtb_rtb: null,
    date_eval_sent_nptab: null,
    date_of_award: null,
    contractor: null,
    implementation_start_date: null,
    implementation_end_date: null,
    implementation_status_pct: null,
    remarks: null,
    awarded_at: null,
    first_appearance_already_awarded: false,
    ...overrides,
  };
}

describe('matchTenders', () => {
  it('treats an identical incoming row as an UPDATE with no field diffs', () => {
    const plan = matchTenders([baseParsed()], [baseSnapshot()]);
    expect(plan.stats.updated).toBe(1);
    expect(plan.stats.new).toBe(0);
    expect(plan.stats.review_queue).toBe(0);
    expect(plan.results[0].field_diffs?.length).toBe(0);
  });

  it('marks a scope-miss as NEW', () => {
    const plan = matchTenders([baseParsed({ agency: 'GWI' as TenderAgency })], [baseSnapshot()]);
    expect(plan.stats.new).toBe(1);
    expect(plan.stats.updated).toBe(0);
  });

  it('routes needs_stage_review rows to ambiguous_stage review even when a scope match exists', () => {
    const plan = matchTenders(
      [baseParsed({ needs_stage_review: true })],
      [baseSnapshot()],
    );
    expect(plan.stats.review_queue).toBe(1);
    expect(plan.stats.review_queue_ambiguous_stage).toBe(1);
    expect(plan.stats.review_queue_ambiguous_match).toBe(0);
    expect(plan.results[0].review_reason).toBe('ambiguous_stage');
    // Candidates empty — ambiguous_stage rows don't carry candidates.
    expect(plan.results[0].candidates?.length ?? 0).toBe(0);
  });

  it('routes mid-similarity (0.80–0.92) scope matches to ambiguous_match review', () => {
    const plan = matchTenders(
      // Add " units" to the snapshot description to land ratio ~0.84.
      [baseParsed({ description: 'Supply and installation of transformer units' })],
      [baseSnapshot()],
    );
    expect(plan.stats.review_queue).toBeGreaterThan(0);
    expect(plan.stats.review_queue_ambiguous_match).toBe(1);
    expect(plan.results[0].review_reason).toBe('ambiguous_match');
  });

  it('never matches against Trello-sourced snapshots', () => {
    const plan = matchTenders(
      [baseParsed()],
      [baseSnapshot({ source: 'trello' })],
    );
    expect(plan.stats.new).toBe(1);
    expect(plan.stats.updated).toBe(0);
    // Trello rows are not counted as "missing" since matcher skips them entirely.
    expect(plan.missing.length).toBe(0);
  });

  it('flags unmatched PSIP snapshots as missing', () => {
    const plan = matchTenders([], [baseSnapshot()]);
    expect(plan.stats.missing).toBe(1);
    expect(plan.missing[0].id).toBe('abc-123');
  });
});
