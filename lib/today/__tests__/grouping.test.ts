import { describe, it, expect } from 'vitest';
import { groupSignals } from '@/components/today/grouping';
import type { TodaySignal, TodaySignalKind } from '@/lib/today/types';

function sig(kind: TodaySignalKind, id: string, rollupCount?: number): TodaySignal {
  return {
    id: `${kind}:${id}`,
    kind,
    severity: 'medium',
    title: id,
    subtitle: null,
    metric: '',
    href: '#',
    agency: null,
    sourceId: id,
    dueDate: null,
    ageDays: null,
    computedAt: '2026-05-03T00:00:00.000Z',
    ...(rollupCount !== undefined ? { rollupCount } : {}),
  };
}

describe('groupSignals', () => {
  it('returns non-empty groups in KIND_ORDER', () => {
    const out = groupSignals([
      sig('meeting_action', 'm1'),
      sig('tender_sla', 't1'),
      sig('delayed_project', 'p1'),
    ]);
    expect(out.map((g) => g.key)).toEqual(['tender_sla', 'delayed_project', 'meeting_action']);
  });

  it('folds stagnant_tender and agency_stagnant_rollup into one group', () => {
    const out = groupSignals([
      sig('stagnant_tender', 's1'),
      sig('agency_stagnant_rollup', 'GPL', 5),
    ]);
    expect(out.filter((g) => g.key === 'stagnant_tender').map((g) => g.items.length)).toEqual([2]);
  });

  it('rollupAwareCount sums signal.rollupCount ?? 1 across the group', () => {
    const out = groupSignals([
      sig('stagnant_tender', 's1'),
      sig('agency_stagnant_rollup', 'GPL', 5),
      sig('agency_stagnant_rollup', 'GWI', 3),
    ]);
    expect(out[0].rollupAwareCount).toBe(9);
  });
});
