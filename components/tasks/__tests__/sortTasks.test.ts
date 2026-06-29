import { describe, it, expect } from 'vitest';
import { sortTasks, type SortField, type SortDir } from '@/components/tasks/TaskListView';
import type { Task, TaskStatus } from '@/lib/task-types';

// Minimal Task factory — sortTasks only reads status/due_date for these cases.
const t = (id: string, status: TaskStatus, due: string | null = null): Task =>
  ({ id, title: id, status, due_date: due, priority: null, created_at: '2026-01-01' } as unknown as Task);

const STATUS: SortField = 'status';
const ASC: SortDir = 'asc';
const DESC: SortDir = 'desc';

describe('sortTasks by status (attention-order weight)', () => {
  it('orders the full enum: active, blocked, awaiting_verification, new, done, superseded', () => {
    const input = [
      t('superseded', 'superseded'),
      t('done', 'done'),
      t('new', 'new'),
      t('awaiting', 'awaiting_verification'),
      t('blocked', 'blocked'),
      t('active', 'active'),
    ];
    const out = sortTasks(input, STATUS, ASC);
    expect(out.map(x => x.id)).toEqual([
      'active',
      'blocked',
      'awaiting',
      'new',
      'done',
      'superseded',
    ]);
  });

  it('renders the three visible statuses as Active / New / Done ascending', () => {
    const out = sortTasks([t('d', 'done'), t('n', 'new'), t('a', 'active')], STATUS, ASC);
    expect(out.map(x => x.id)).toEqual(['a', 'n', 'd']);
  });

  it('inverts under descending', () => {
    const out = sortTasks([t('a', 'active'), t('n', 'new'), t('d', 'done')], STATUS, DESC);
    expect(out.map(x => x.id)).toEqual(['d', 'n', 'a']);
  });

  it('is stable on a status tie, preserving incoming order', () => {
    // Array.prototype.sort is stable, and the API returns rows already ordered
    // status, due_date asc — so tied statuses keep their due-date order without
    // any explicit tiebreak. Here a1 (earlier due) precedes a2 in the input and
    // must stay ahead after sorting.
    const out = sortTasks(
      [t('a1', 'active', '2026-01-05'), t('a2', 'active', '2026-01-10'), t('s', 'superseded')],
      STATUS,
      ASC,
    );
    expect(out.map(x => x.id)).toEqual(['a1', 'a2', 's']);
  });
});
