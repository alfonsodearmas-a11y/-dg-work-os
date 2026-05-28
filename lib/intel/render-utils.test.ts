import { describe, expect, test } from 'vitest';
import {
  computeLedeStats,
  formatDueDate,
  formatGYD,
  isExplicitPlaceholderOwner,
  isPresentOwner,
  reasonLabel,
  stageLabel,
} from './render-utils';

describe('isPresentOwner', () => {
  test('null is not present', () => {
    expect(isPresentOwner(null)).toBe(false);
  });
  test('undefined is not present', () => {
    expect(isPresentOwner(undefined)).toBe(false);
  });
  test('empty string is not present', () => {
    expect(isPresentOwner('')).toBe(false);
  });
  test('whitespace is not present', () => {
    expect(isPresentOwner('   ')).toBe(false);
  });
  test('TBD is not present', () => {
    expect(isPresentOwner('TBD')).toBe(false);
  });
  test('Pending Assignment is not present', () => {
    expect(isPresentOwner('Pending Assignment')).toBe(false);
  });
  test('Unassigned is not present', () => {
    expect(isPresentOwner('Unassigned')).toBe(false);
  });
  test('placeholder is not present', () => {
    expect(isPresentOwner('placeholder')).toBe(false);
  });
  test('real name is present', () => {
    expect(isPresentOwner('Aisha Khan')).toBe(true);
  });
});

describe('isExplicitPlaceholderOwner', () => {
  test('null is not explicit', () => {
    expect(isExplicitPlaceholderOwner(null)).toBe(false);
  });
  test('empty is not explicit', () => {
    expect(isExplicitPlaceholderOwner('')).toBe(false);
  });
  test('TBD is explicit', () => {
    expect(isExplicitPlaceholderOwner('TBD')).toBe(true);
  });
  test('Unassigned is explicit', () => {
    expect(isExplicitPlaceholderOwner('Unassigned')).toBe(true);
  });
  test('real name is not explicit', () => {
    expect(isExplicitPlaceholderOwner('Aisha Khan')).toBe(false);
  });
});

describe('stageLabel', () => {
  test('known stage', () => {
    expect(stageLabel('awaiting_award')).toBe('Awaiting Award');
  });
  test('unknown stage is humanized', () => {
    expect(stageLabel('post_award_review')).toBe('Post Award Review');
  });
  test('null is empty string', () => {
    expect(stageLabel(null)).toBe('');
  });
});

describe('reasonLabel', () => {
  test('known reason', () => {
    expect(reasonLabel('stale_award')).toBe('Stale award.');
  });
  test('unknown returns raw', () => {
    expect(reasonLabel('something_else')).toBe('something_else');
  });
  test('null is empty', () => {
    expect(reasonLabel(null)).toBe('');
  });
});

describe('computeLedeStats — procurement unnamed counts placeholders only', () => {
  test('null owners are not counted as unnamed', () => {
    const data = {
      open_tasks: [],
      delayed_projects: [],
      critical_procurement: [
        { next_action_owner: 'Aisha Khan' },
        { next_action_owner: null },
        { next_action_owner: 'TBD' },
        { next_action_owner: 'Pending Assignment' },
      ],
    } as never;
    const stats = computeLedeStats(data);
    expect(stats.procurementTotal).toBe(4);
    expect(stats.procurementUnnamed).toBe(2);
  });
});

describe('computeLedeStats — delayed slip excludes null', () => {
  test('null days_overdue do not contribute to slip total', () => {
    const data = {
      open_tasks: [],
      delayed_projects: [
        { days_overdue: 10 },
        { days_overdue: null },
        { days_overdue: 5 },
        { days_overdue: 0 },
        { days_overdue: -3 },
      ],
      critical_procurement: [],
    } as never;
    const stats = computeLedeStats(data);
    expect(stats.delayedTotalDaysSlip).toBe(15);
  });
});

describe('computeLedeStats — open tasks overdue', () => {
  test('only is_overdue true contributes', () => {
    const data = {
      open_tasks: [
        { is_overdue: true },
        { is_overdue: false },
        { is_overdue: true },
        { is_overdue: undefined },
      ],
      delayed_projects: [],
      critical_procurement: [],
    } as never;
    const stats = computeLedeStats(data);
    expect(stats.openTasksTotal).toBe(4);
    expect(stats.openTasksOverdue).toBe(2);
  });
});

describe('formatGYD — whole dollars, no /100 scaling', () => {
  test('formats whole dollars directly', () => {
    expect(formatGYD(26656434700)).toBe('GYD 26,656,434,700');
  });
  test('null is null', () => {
    expect(formatGYD(null)).toBeNull();
  });
  test('zero is null', () => {
    expect(formatGYD(0)).toBeNull();
  });
  test('negative is null', () => {
    expect(formatGYD(-1)).toBeNull();
  });
});

describe('formatDueDate', () => {
  test('iso is formatted', () => {
    const out = formatDueDate('2026-05-28');
    expect(out).not.toBeNull();
    expect(out).toMatch(/2026/);
  });
  test('null is null', () => {
    expect(formatDueDate(null)).toBeNull();
  });
  test('invalid is null', () => {
    expect(formatDueDate('not-a-date')).toBeNull();
  });
});
