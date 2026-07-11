// OP Direct outbox — composition + status-map unit tests (pure paths of
// lib/direct-outreach/outbox.ts; the transaction-level enqueue hooks are
// covered in queries-outbox.test.ts).

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db-pg', () => ({ query: vi.fn(), transaction: vi.fn() }));

import type { PoolClient } from 'pg';
import {
  OP_STATUS_TARGETS,
  composeOfficerUpdateOutbox,
  enqueueOutboxRow,
  resolveMentionsForOutbox,
} from '@/lib/direct-outreach/outbox';

describe('OP_STATUS_TARGETS — the single explicit DG→OP map', () => {
  it('maps ONLY resolved_pending_verification → Resolved', () => {
    expect(OP_STATUS_TARGETS).toEqual({ resolved_pending_verification: 'Resolved' });
  });
});

describe('composeOfficerUpdateOutbox — one update = one row = one OP comment', () => {
  it('remark only → kind remark, comment verbatim, no OP status', () => {
    expect(
      composeOfficerUpdateOutbox({ body: 'Crew dispatched to site', workingStatus: null, targetDate: undefined }),
    ).toEqual({
      sourceKind: 'remark',
      commentText: 'Crew dispatched to site',
      opStatusTarget: null,
    });
  });

  it('non-resolved status change → kind status, human label, comment-only', () => {
    expect(
      composeOfficerUpdateOutbox({ body: null, workingStatus: 'in_progress', targetDate: undefined }),
    ).toEqual({
      sourceKind: 'status',
      commentText: 'Status -> In progress',
      opStatusTarget: null,
    });
  });

  it('resolved_pending_verification → op_status_target Resolved', () => {
    expect(
      composeOfficerUpdateOutbox({
        body: null,
        workingStatus: 'resolved_pending_verification',
        targetDate: undefined,
      }),
    ).toEqual({
      sourceKind: 'status',
      commentText: 'Status -> Resolved — pending verification',
      opStatusTarget: 'Resolved',
    });
  });

  it('target date set → kind target', () => {
    expect(
      composeOfficerUpdateOutbox({ body: null, workingStatus: null, targetDate: '2026-08-15' }),
    ).toEqual({
      sourceKind: 'target',
      commentText: 'Target date -> 2026-08-15',
      opStatusTarget: null,
    });
  });

  it('target date cleared → kind target, explicit wording', () => {
    expect(
      composeOfficerUpdateOutbox({ body: null, workingStatus: null, targetDate: null }),
    ).toEqual({
      sourceKind: 'target',
      commentText: 'Target date cleared',
      opStatusTarget: null,
    });
  });

  it('combined remark + resolved status + target → ONE row, joined comment, status kind wins', () => {
    expect(
      composeOfficerUpdateOutbox({
        body: 'Verified on site',
        workingStatus: 'resolved_pending_verification',
        targetDate: '2026-08-15',
      }),
    ).toEqual({
      sourceKind: 'status',
      commentText: 'Verified on site · Status -> Resolved — pending verification · Target date -> 2026-08-15',
      opStatusTarget: 'Resolved',
    });
  });

  it('remark + target (no status) → remark kind', () => {
    expect(
      composeOfficerUpdateOutbox({ body: 'ETA below', workingStatus: null, targetDate: '2026-09-01' }),
    ).toMatchObject({ sourceKind: 'remark', commentText: 'ETA below · Target date -> 2026-09-01' });
  });

  it('empty update → null (route schema already rejects these)', () => {
    expect(composeOfficerUpdateOutbox({ body: '  ', workingStatus: null, targetDate: undefined })).toBeNull();
  });
});

describe('enqueueOutboxRow — dgos_ref minted from the row id', () => {
  it('inserts on the CALLER’s client (same transaction) with dgos_ref = DGOS-<id>', async () => {
    const clientQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const client = { query: clientQuery } as unknown as PoolClient;
    await enqueueOutboxRow(client, {
      caseId: 58244,
      sourceKind: 'assignment',
      commentText: 'Assigned to John Smith',
      authorUserId: 'author-uuid',
      authorLabel: 'DG Alfonso',
    });
    expect(clientQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = clientQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO direct_outreach_opdirect_outbox');
    const [id, ...rest] = params;
    expect(String(id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(rest).toEqual([
      58244,
      'assignment',
      null,
      `DGOS-${id}`, // ref and pk can never disagree
      'Assigned to John Smith',
      null,
      'author-uuid',
      'DG Alfonso',
    ]);
  });
});

describe('resolveMentionsForOutbox — full-length @Name resolution (no 140-char cut)', () => {
  it('replaces @[uuid] with @Name and keeps unknown uuids as @User', async () => {
    const uid = '11111111-2222-4333-8444-555555555555';
    const unknown = '99999999-8888-4777-8666-555555555555';
    const clientQuery = vi.fn().mockResolvedValue({ rows: [{ id: uid, name: 'Jane Officer' }] });
    const client = { query: clientQuery } as unknown as PoolClient;
    const long = 'x'.repeat(300);
    const out = await resolveMentionsForOutbox(client, `@[${uid}] and @[${unknown}] — ${long}`);
    expect(out).toBe(`@Jane Officer and @User — ${long}`);
    expect(out.length).toBeGreaterThan(140); // notifications truncate; the outbox must not
  });

  it('no mentions → no user query at all', async () => {
    const clientQuery = vi.fn();
    const client = { query: clientQuery } as unknown as PoolClient;
    expect(await resolveMentionsForOutbox(client, 'plain remark')).toBe('plain remark');
    expect(clientQuery).not.toHaveBeenCalled();
  });
});
