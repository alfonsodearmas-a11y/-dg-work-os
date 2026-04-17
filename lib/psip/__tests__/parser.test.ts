import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePsipWorkbook } from '@/lib/psip/parser';

const FIXTURE = resolve(__dirname, '../../../tests/fixtures/psip-2026-04-16.xlsx');
const workbookBuffer = readFileSync(FIXTURE);

describe('parsePsipWorkbook — 2026-04-16 fixture', () => {
  const { tenders, stats } = parsePsipWorkbook(workbookBuffer);

  it('parses 82 tenders (79 real + 3 ambiguous_stage review rows)', () => {
    expect(stats.tenders_parsed).toBe(82);
    expect(stats.queued_for_stage_review).toBe(3);
  });

  it('excludes 14 rows under Lethem / HECI sub-programmes', () => {
    expect(stats.excluded_lethem_heci).toBe(14);
  });

  it('drops 2 programme-344 bare-header duplicates', () => {
    expect(stats.programme_header_dupes).toBe(2);
  });

  it('rejects 50 rows via the method filter (non-Open / non-Public)', () => {
    expect(stats.excluded_method_filter).toBe(50);
  });

  it('absorbs 7 rows inside the Summary rollup block', () => {
    expect(stats.skipped_summary_rollup).toBe(7);
  });

  it('skips 8 divider rows (Rollover:, New, etc.)', () => {
    expect(stats.skipped_dividers).toBe(8);
  });

  it('normalizes 2 "Public Tender" rows into open_tender', () => {
    expect(stats.normalized_public_tender).toBe(2);
  });

  it('collapses 14 parent rows with children + 32 parent-as-tender rows', () => {
    expect(stats.parents_collapsed_children).toBe(14);
    expect(stats.parents_self_as_tender).toBe(32);
  });

  it('emits every tender with an Open Tender method (strict method filter)', () => {
    for (const t of tenders) {
      expect(t.method).toBe('open_tender');
    }
  });

  it('emits MARAD with exactly 4 tenders', () => {
    expect(tenders.filter((t) => t.agency === 'MARAD').length).toBe(4);
  });

  it('flags the 3 Bartica rows as needs_stage_review', () => {
    const reviews = tenders.filter((t) => t.needs_stage_review);
    expect(reviews.length).toBe(3);
    for (const r of reviews) {
      expect(r.description.toLowerCase()).toContain('bartica');
      expect(r.agency).toBe('GWI');
    }
  });

  it('sets parent-as-tender programme_activity to NULL (no self-echo)', () => {
    const parentsAsTender = tenders.filter((t) => t.line_item_code && !t.programme_activity);
    // Every row that carries a line_item_code should have NULL programme_activity,
    // since the spec treats "parent-with-no-children" as the tender itself with
    // no super-parent programme_activity context.
    expect(parentsAsTender.length).toBeGreaterThan(0);
    for (const t of parentsAsTender) {
      expect(t.programme_activity).toBeNull();
    }
  });

  it('emits NO tender with description equal to a stage name (summary rollup)', () => {
    const stageWords = ['Award', 'Awaiting Award', 'Evaluation', 'Advertised', 'Design', 'Rollover'];
    for (const t of tenders) {
      expect(stageWords).not.toContain(t.description);
    }
  });

  it('does not emit the "New" divider row from R105', () => {
    const newRow = tenders.find((t) => t.description === 'New');
    expect(newRow).toBeUndefined();
  });

  it('emits the MARAD Dredging of Demerara River row with has_exception=true, inferred stage', () => {
    const dredge = tenders.find((t) => /dredging of demerara/i.test(t.description));
    expect(dredge).toBeDefined();
    expect(dredge!.agency).toBe('MARAD');
    expect(dredge!.has_exception).toBe(true);
    expect(dredge!.stage_source).toBe('inferred_from_dates');
  });

  it('never emits a tender with a non-Open method value', () => {
    const invalidMethods = new Set(['quotation', 'sole_source', 'restrictive', 'comm_participation']);
    for (const t of tenders) {
      expect(invalidMethods.has(t.method ?? '')).toBe(false);
    }
  });
});
