// OP Direct outbox endpoints — auth matrix (superadmin session vs constant-time
// BRIDGE_TOKEN header) and status transitions (export/ack/fail/retry/skip).

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { mockRequireRole, query } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
  query: vi.fn(),
}));
vi.mock('@/lib/auth-helpers', () => ({ requireRole: mockRequireRole }));
vi.mock('@/lib/db-pg', () => ({ query, transaction: vi.fn() }));

import { GET as listGET } from '@/app/api/direct-outreach/outbox/route';
import { GET as exportGET } from '@/app/api/direct-outreach/outbox/export/route';
import { POST as ackPOST } from '@/app/api/direct-outreach/outbox/ack/route';
import { POST as failPOST } from '@/app/api/direct-outreach/outbox/[id]/fail/route';
import { POST as retryPOST } from '@/app/api/direct-outreach/outbox/[id]/retry/route';
import { POST as skipPOST } from '@/app/api/direct-outreach/outbox/[id]/skip/route';

const ROW_ID = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'test-bridge-secret';

function superadmin() {
  mockRequireRole.mockResolvedValue({
    session: { user: { id: 'super-1', role: 'superadmin', agency: null, name: 'DG' } },
  });
}
function denied(status: number, error: string) {
  mockRequireRole.mockResolvedValue(NextResponse.json({ error }, { status }));
}

function req(path: string, init?: { method?: string; body?: unknown; token?: string }) {
  return new NextRequest(new URL(`http://localhost:3000${path}`), {
    method: init?.method ?? 'GET',
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    headers: {
      'Content-Type': 'application/json',
      ...(init?.token ? { 'x-bridge-token': init.token } : {}),
    },
  });
}
const idParams = { params: Promise.resolve({ id: ROW_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BRIDGE_TOKEN = TOKEN;
  query.mockResolvedValue({ rows: [], rowCount: 0 });
});
afterEach(() => {
  delete process.env.BRIDGE_TOKEN;
});

describe('GET /api/direct-outreach/outbox (superadmin UI)', () => {
  it('superadmin sees counts + rows', async () => {
    superadmin();
    query.mockImplementation(async (sql: string) =>
      sql.includes('GROUP BY status')
        ? { rows: [{ status: 'pending', n: 2 }, { status: 'failed', n: 1 }] }
        : { rows: [{ id: ROW_ID, case_id: 58244, source_kind: 'status', status: 'pending' }] },
    );
    const res = await listGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts).toEqual({ pending: 2, posted: 0, skipped: 0, failed: 1 });
    expect(body.rows).toHaveLength(1);
    expect(mockRequireRole).toHaveBeenCalledWith(['superadmin']);
  });

  it('non-superadmin → 403 (UI gate)', async () => {
    denied(403, 'Insufficient permissions');
    const res = await listGET();
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('GET /api/direct-outreach/outbox/export (bridge)', () => {
  it('good BRIDGE_TOKEN → pending rows, session never consulted', async () => {
    query.mockResolvedValue({
      rows: [
        {
          id: ROW_ID,
          case_id: 58244,
          dgos_ref: `DGOS-${ROW_ID}`,
          comment_text: 'Status -> Resolved — pending verification',
          op_status_target: 'Resolved',
          author_label: 'Officer One',
        },
      ],
    });
    const res = await exportGET(req('/api/direct-outreach/outbox/export', { token: TOKEN }));
    expect(res.status).toBe(200);
    expect((await res.json()).pending).toHaveLength(1);
    expect(mockRequireRole).not.toHaveBeenCalled();
    expect(String(query.mock.calls[0][0])).toContain(`WHERE status = 'pending'`);
  });

  it('bad token falls through to the session check → 401', async () => {
    denied(401, 'Authentication required');
    const res = await exportGET(req('/api/direct-outreach/outbox/export', { token: 'wrong' }));
    expect(res.status).toBe(401);
    expect(mockRequireRole).toHaveBeenCalledWith(['superadmin']);
  });

  it('no token + superadmin session → 200', async () => {
    superadmin();
    const res = await exportGET(req('/api/direct-outreach/outbox/export'));
    expect(res.status).toBe(200);
  });

  it('unset BRIDGE_TOKEN env never matches (no empty-secret hole)', async () => {
    delete process.env.BRIDGE_TOKEN;
    denied(401, 'Authentication required');
    const res = await exportGET(req('/api/direct-outreach/outbox/export', { token: '' }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/direct-outreach/outbox/ack', () => {
  it('acks pending rows → posted, recording opdirect_comment_id', async () => {
    query.mockResolvedValue({ rowCount: 1, rows: [] });
    const res = await ackPOST(
      req('/api/direct-outreach/outbox/ack', {
        method: 'POST',
        token: TOKEN,
        body: [{ id: ROW_ID, opdirect_comment_id: '139251' }],
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ acked: 1 });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(`SET status = 'posted'`);
    expect(sql).toContain(`WHERE id = $1 AND status = 'pending'`);
    expect(params).toEqual([ROW_ID, '139251']);
  });

  it('invalid body → 400', async () => {
    const res = await ackPOST(
      req('/api/direct-outreach/outbox/ack', { method: 'POST', token: TOKEN, body: { nope: true } }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/direct-outreach/outbox/[id]/fail', () => {
  it('pending → failed with attempts++ and last_error', async () => {
    query.mockResolvedValue({ rowCount: 1, rows: [] });
    const res = await failPOST(
      req(`/api/direct-outreach/outbox/${ROW_ID}/fail`, {
        method: 'POST',
        token: TOKEN,
        body: { last_error: 'Save button not found' },
      }),
      idParams,
    );
    expect(res.status).toBe(200);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('attempts = attempts + 1');
    expect(sql).toContain(`SET status = 'failed'`);
    expect(params).toEqual([ROW_ID, 'Save button not found']);
  });

  it('non-pending row → 409; unknown row → 404', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.startsWith('UPDATE') ? { rowCount: 0, rows: [] } : { rows: [{ status: 'posted' }] },
    );
    const conflict = await failPOST(
      req(`/api/direct-outreach/outbox/${ROW_ID}/fail`, { method: 'POST', token: TOKEN, body: { last_error: 'x' } }),
      idParams,
    );
    expect(conflict.status).toBe(409);

    query.mockImplementation(async (sql: string) =>
      sql.startsWith('UPDATE') ? { rowCount: 0, rows: [] } : { rows: [] },
    );
    const missing = await failPOST(
      req(`/api/direct-outreach/outbox/${ROW_ID}/fail`, { method: 'POST', token: TOKEN, body: { last_error: 'x' } }),
      idParams,
    );
    expect(missing.status).toBe(404);
  });
});

describe('POST retry/skip — superadmin ONLY (bridge token is NOT accepted)', () => {
  it('retry ignores x-bridge-token and requires the session', async () => {
    denied(401, 'Authentication required');
    const res = await retryPOST(
      req(`/api/direct-outreach/outbox/${ROW_ID}/retry`, { method: 'POST', token: TOKEN }),
      idParams,
    );
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('retry: failed|skipped → pending', async () => {
    superadmin();
    query.mockResolvedValue({ rowCount: 1, rows: [] });
    const res = await retryPOST(req(`/api/direct-outreach/outbox/${ROW_ID}/retry`, { method: 'POST' }), idParams);
    expect(res.status).toBe(200);
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain(`SET status = 'pending'`);
    expect(sql).toContain(`IN ('failed', 'skipped')`);
  });

  it('skip: pending → skipped; posted row → 409', async () => {
    superadmin();
    query.mockResolvedValue({ rowCount: 1, rows: [] });
    const ok = await skipPOST(req(`/api/direct-outreach/outbox/${ROW_ID}/skip`, { method: 'POST' }), idParams);
    expect(ok.status).toBe(200);
    expect(String(query.mock.calls[0][0])).toContain(`SET status = 'skipped'`);

    query.mockImplementation(async (sql: string) =>
      sql.startsWith('UPDATE') ? { rowCount: 0, rows: [] } : { rows: [{ status: 'posted' }] },
    );
    const conflict = await skipPOST(req(`/api/direct-outreach/outbox/${ROW_ID}/skip`, { method: 'POST' }), idParams);
    expect(conflict.status).toBe(409);
  });

  it('invalid id → 400 before touching the db', async () => {
    superadmin();
    const res = await skipPOST(req('/api/direct-outreach/outbox/nope/skip', { method: 'POST' }), {
      params: Promise.resolve({ id: 'nope' }),
    });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
