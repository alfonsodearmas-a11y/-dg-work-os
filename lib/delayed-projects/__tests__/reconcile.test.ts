import { describe, it, expect } from 'vitest';
import { planReconciliation, SNAPSHOT_CLEAR_THRESHOLD } from '../reconcile';

const inc = (o: Partial<any> = {}) => ({
  source_id: 1,
  project_reference: 'R1',
  project_name: 'P',
  sub_agency: 'GWI',
  completion_percent: 10,
  executing_agency: 'MOPUA',
  region: null,
  tender_board_type: null,
  contract_value: 0,
  contractors: null,
  project_end_date: null,
  has_images: false,
  status: 'DELAYED',
  ...o,
});
const ex = (o: Partial<any> = {}) => ({
  id: 'u1',
  source_id: 1,
  project_reference: 'R1',
  status: 'DELAYED',
  completion_percent: 10,
  project_name: 'P',
  sub_agency: 'GWI',
  ...o,
});

describe('planReconciliation', () => {
  it('clears a DELAYED project absent from the upload', () => {
    const plan = planReconciliation([ex({ id: 'a', source_id: 9, project_reference: 'R9' })], [inc()], true);
    expect(plan.toResolveIds).toEqual(['a']);
    expect(plan.counts.resolvedCount).toBe(1);
    expect(plan.toInsert).toHaveLength(1);
  });
  it('matches existing rows that lack source_id by trimmed project_reference (migration bridge)', () => {
    const plan = planReconciliation([ex({ source_id: null, project_reference: 'R1   ' })], [inc({ project_reference: 'R1' })], true);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toResolveIds).toEqual([]);
  });
  it('matches on source_id even when the reference text differs', () => {
    const plan = planReconciliation([ex({ source_id: 1, project_reference: 'OLD' })], [inc({ source_id: 1, project_reference: 'NEW' })], true);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toResolveIds).toEqual([]);
  });
  it('reopens a RESOLVED project that reappears', () => {
    const plan = planReconciliation([ex({ status: 'RESOLVED' })], [inc()], true);
    expect(plan.toUpdate[0].reopened).toBe(true);
    expect(plan.counts.reopenedCount).toBe(1);
    expect(plan.counts.updatedCount).toBe(0);
  });
  it('trips the guard above threshold when not confirmed', () => {
    const existing = Array.from({ length: 10 }, (_, i) => ex({ id: `e${i}`, source_id: 100 + i, project_reference: `R${100 + i}` }));
    const plan = planReconciliation(existing, [inc({ source_id: 100, project_reference: 'R100' })], false); // 9/10 absent = 0.9 > 0.35
    expect(plan.guardTripped).toBe(true);
    expect(plan.toResolveIds).toEqual([]);  // no mutation when tripped
    expect(plan.absentFraction).toBeGreaterThan(SNAPSHOT_CLEAR_THRESHOLD);
  });
  it('does NOT trip when confirmFullExport=true', () => {
    const existing = Array.from({ length: 10 }, (_, i) => ex({ id: `e${i}`, source_id: 100 + i, project_reference: `R${100 + i}` }));
    const plan = planReconciliation(existing, [inc({ source_id: 100, project_reference: 'R100' })], true);
    expect(plan.guardTripped).toBe(false);
    expect(plan.toResolveIds.length).toBe(9);
  });
  it('ignores already-RESOLVED rows when computing the absent fraction', () => {
    const plan = planReconciliation([ex({ id: 'r', status: 'RESOLVED', source_id: 5, project_reference: 'R5' }), ex({ id: 'd', source_id: 6, project_reference: 'R6' })], [inc({ source_id: 6, project_reference: 'R6' })], false);
    expect(plan.activeDelayed).toBe(1);     // only the DELAYED one
    expect(plan.guardTripped).toBe(false);  // 0 absent
  });
});
