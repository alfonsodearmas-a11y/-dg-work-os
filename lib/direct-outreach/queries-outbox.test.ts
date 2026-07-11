// OP Direct outbox — enqueue hooks fire on EVERY mutation kind, inside the SAME
// transaction as the underlying change. db-pg's transaction() is mocked to
// actually execute the callback against a scripted client, so these tests
// assert the real SQL flow: change → (lookups) → outbox INSERT, co-committed.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clientQuery, query, transaction } = vi.hoisted(() => {
  const clientQuery = vi.fn();
  return {
    clientQuery,
    query: vi.fn(),
    transaction: vi.fn(async (cb: (client: { query: typeof clientQuery }) => Promise<unknown>) =>
      cb({ query: clientQuery }),
    ),
  };
});
vi.mock('@/lib/db-pg', () => ({ query, transaction }));

import { clearAssignee, insertOfficerUpdate, setAssignee } from '@/lib/direct-outreach/queries';

const CASE_ID = 58244;
const ACTOR = 'aaaaaaaa-1111-4222-8333-444444444444';
const ASSIGNEE = 'bbbbbbbb-1111-4222-8333-444444444444';
const UPDATE_ID = 'cccccccc-1111-4222-8333-444444444444';

/** The single outbox INSERT issued during the test, decoded, or undefined.
 *  Param order: [id, case_id, source_kind, officer_update_id, dgos_ref,
 *  comment_text, op_status_target, author_user_id, author_label]. */
function outboxCall():
  | {
      sql: string;
      caseId: unknown;
      kind: unknown;
      updateId: unknown;
      ref: unknown;
      comment: unknown;
      target: unknown;
      author: unknown;
      label: unknown;
    }
  | undefined {
  const call = clientQuery.mock.calls.find(([sql]) =>
    String(sql).includes('direct_outreach_opdirect_outbox'),
  );
  if (!call) return undefined;
  const p = call[1] as unknown[];
  expect(p[4]).toBe(`DGOS-${p[0]}`); // invariant on every enqueue
  return {
    sql: String(call[0]),
    caseId: p[1],
    kind: p[2],
    updateId: p[3],
    ref: p[4],
    comment: p[5],
    target: p[6],
    author: p[7],
    label: p[8],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assignment / unassignment enqueue', () => {
  it('assign → one outbox row: kind assignment, "Assigned to {name}", actor attribution', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO direct_outreach_assignments')) return { rowCount: 1, rows: [] };
      if (sql.includes('FROM users')) return { rows: [{ name: 'John Smith' }] };
      return { rowCount: 1, rows: [] };
    });
    const applied = await setAssignee(CASE_ID, ASSIGNEE, ACTOR, 'GPL', 'DG Alfonso');
    expect(applied).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(1); // change + enqueue share one tx
    expect(outboxCall()).toMatchObject({
      caseId: CASE_ID,
      kind: 'assignment',
      updateId: null,
      comment: 'Assigned to John Smith',
      target: null,
      author: ACTOR,
      label: 'DG Alfonso',
    });
  });

  it('guard-failed assign (concurrent transfer) → NO outbox row', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO direct_outreach_assignments')) return { rowCount: 0, rows: [] };
      return { rowCount: 0, rows: [] };
    });
    expect(await setAssignee(CASE_ID, ASSIGNEE, ACTOR, 'GPL', 'DG Alfonso')).toBe(false);
    expect(outboxCall()).toBeUndefined();
  });

  it('unassign → one outbox row: kind unassignment, "Unassigned {name}"', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('DELETE FROM direct_outreach_assignments'))
        return { rows: [{ assignee_user_id: ASSIGNEE }], rowCount: 1 };
      if (sql.includes('FROM users')) return { rows: [{ name: 'John Smith' }] };
      return { rowCount: 1, rows: [] };
    });
    await clearAssignee(CASE_ID, ACTOR, 'DG Alfonso');
    expect(outboxCall()).toMatchObject({
      caseId: CASE_ID,
      kind: 'unassignment',
      updateId: null,
      comment: 'Unassigned John Smith',
      target: null,
      author: ACTOR,
      label: 'DG Alfonso',
    });
  });

  it('unassign when already unassigned → nothing changed, NO outbox row', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('DELETE FROM direct_outreach_assignments')) return { rows: [], rowCount: 0 };
      return { rowCount: 0, rows: [] };
    });
    await clearAssignee(CASE_ID, ACTOR, 'DG Alfonso');
    expect(outboxCall()).toBeUndefined();
  });
});

describe('officer-update enqueue — one update = one combined row', () => {
  function armUpdateClient(logRow: Record<string, unknown> = {}) {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO direct_outreach_officer_updates'))
        return { rows: [{ id: UPDATE_ID, case_id: CASE_ID, ...logRow }], rowCount: 1 };
      if (sql.includes('SELECT id, name FROM users'))
        return { rows: [{ id: ASSIGNEE, name: 'Jane Officer' }] };
      return { rowCount: 1, rows: [] };
    });
  }

  const base = { caseId: CASE_ID, authorId: ACTOR, authorLabel: 'Officer One' };

  it('remark → kind remark, verbatim comment, links the log row id', async () => {
    armUpdateClient();
    await insertOfficerUpdate({ ...base, body: 'Crew on site', workingStatus: null, targetDate: undefined });
    expect(outboxCall()).toMatchObject({
      caseId: CASE_ID,
      kind: 'remark',
      updateId: UPDATE_ID,
      comment: 'Crew on site',
      target: null,
      author: ACTOR,
      label: 'Officer One',
    });
  });

  it('status → resolved_pending_verification sets op_status_target Resolved', async () => {
    armUpdateClient();
    await insertOfficerUpdate({
      ...base,
      body: null,
      workingStatus: 'resolved_pending_verification',
      targetDate: undefined,
    });
    expect(outboxCall()).toMatchObject({
      caseId: CASE_ID,
      kind: 'status',
      updateId: UPDATE_ID,
      comment: 'Status -> Resolved — pending verification',
      target: 'Resolved',
      author: ACTOR,
      label: 'Officer One',
    });
  });

  it('status → any other status is comment-only (no OP status change)', async () => {
    armUpdateClient();
    await insertOfficerUpdate({ ...base, body: null, workingStatus: 'blocked', targetDate: undefined });
    const call = outboxCall();
    expect(call?.comment).toBe('Status -> Blocked');
    expect(call?.target).toBeNull();
  });

  it('target set → "Target date -> YYYY-MM-DD"', async () => {
    armUpdateClient();
    await insertOfficerUpdate({ ...base, body: null, workingStatus: null, targetDate: '2026-08-15' });
    expect(outboxCall()).toMatchObject({
      kind: 'target',
      updateId: UPDATE_ID,
      comment: 'Target date -> 2026-08-15',
      target: null,
    });
  });

  it('target cleared → "Target date cleared"', async () => {
    armUpdateClient();
    await insertOfficerUpdate({ ...base, body: null, workingStatus: null, targetDate: null });
    expect(outboxCall()?.comment).toBe('Target date cleared');
  });

  it('combined remark+status+target → ONE row with all parts and mentions resolved full-length', async () => {
    armUpdateClient();
    await insertOfficerUpdate({
      ...base,
      body: `@[${ASSIGNEE}] verified on site`,
      workingStatus: 'resolved_pending_verification',
      targetDate: '2026-08-15',
    });
    const outboxInserts = clientQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('direct_outreach_opdirect_outbox'),
    );
    expect(outboxInserts).toHaveLength(1); // one update = one OP comment
    expect(outboxCall()?.comment).toBe(
      '@Jane Officer verified on site · Status -> Resolved — pending verification · Target date -> 2026-08-15',
    );
    expect(outboxCall()?.target).toBe('Resolved');
  });
});
