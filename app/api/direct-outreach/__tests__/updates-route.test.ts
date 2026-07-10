// Route-level permission matrix for POST /api/direct-outreach/[caseId]/updates
// (locked requirement): assigned officer OK, owning-agency manager OK,
// OTHER-agency manager gets an opaque 404 (no cross-agency write), superadmin
// OK, unknown case 404. Auth + data layer are mocked; the route's own scope
// derivation and the REAL canPostOutreachUpdate helper run unmocked.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { mockRequireModuleAccess, mockGetCase, mockInsertOfficerUpdate, mockFilterMentionable, mockCreateNotification } =
  vi.hoisted(() => ({
    mockRequireModuleAccess: vi.fn(),
    mockGetCase: vi.fn(),
    mockInsertOfficerUpdate: vi.fn(),
    mockFilterMentionable: vi.fn(),
    mockCreateNotification: vi.fn(),
  }));

vi.mock('@/lib/auth-helpers', () => ({
  requireModuleAccess: mockRequireModuleAccess,
}));

vi.mock('@/lib/direct-outreach/queries', () => ({
  getCase: mockGetCase,
  insertOfficerUpdate: mockInsertOfficerUpdate,
  filterMentionableUsers: mockFilterMentionable,
}));

vi.mock('@/lib/notifications/mention-utils', () => ({
  cleanMentionBody: vi.fn(async (body: string) => ({ mentionedUserIds: [], cleanBody: body })),
}));

vi.mock('@/lib/notifications/notification-service', () => ({
  createNotification: mockCreateNotification,
}));

import { POST } from '@/app/api/direct-outreach/[caseId]/updates/route';

const CASE_ID = 7;
const ASSIGNEE = 'officer-1';

// The scoped-getCase contract: case #7 has effective agency GPL; a scope other
// than GPL sees nothing (opaque 404) — exactly what queries.getCase does live.
function caseDetail() {
  return {
    case: { case_id: CASE_ID, effective_agency: 'GPL', assignee_user_id: ASSIGNEE, description: 'x' },
    updates: [],
    transfers: [],
    officer_updates: [],
    state: { working_status: 'not_started', target_date: null, updated_by: null, updated_by_name: null, updated_at: null },
  };
}

function sessionFor(user: { id: string; role: string; agency: string | null; name?: string }) {
  mockRequireModuleAccess.mockResolvedValue({ session: { user } });
}

function post(caseId: string | number, body: unknown): [NextRequest, { params: Promise<{ caseId: string }> }] {
  const req = new NextRequest(new URL(`http://localhost:3000/api/direct-outreach/${caseId}/updates`), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  return [req, { params: Promise.resolve({ caseId: String(caseId) }) }];
}

const flushAsync = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCase.mockImplementation(async (id: number, scope?: string) =>
    id === CASE_ID && (scope === undefined || scope === 'GPL') ? caseDetail() : null,
  );
  mockInsertOfficerUpdate.mockResolvedValue({
    id: 'update-1', case_id: CASE_ID, author_id: 'x', body: 'hello',
    new_working_status: null, new_target_date: null, target_cleared: false,
    created_at: new Date().toISOString(),
  });
  mockFilterMentionable.mockResolvedValue([]);
  mockCreateNotification.mockResolvedValue(null);
});

describe('POST /api/direct-outreach/[caseId]/updates — permission matrix', () => {
  it('assigned officer may post (201) and gets no self-notification', async () => {
    sessionFor({ id: ASSIGNEE, role: 'agency_manager', agency: 'GPL', name: 'Officer One' });
    const res = await POST(...post(CASE_ID, { body: 'progress made' }));
    expect(res.status).toBe(201);
    expect(mockInsertOfficerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: CASE_ID, authorId: ASSIGNEE, body: 'progress made' }),
    );
    await flushAsync();
    // author === assignee → no outreach_case_update fan-out
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('owning-agency manager (not the assignee) may post; assignee is notified', async () => {
    sessionFor({ id: 'mgr-2', role: 'agency_manager', agency: 'GPL', name: 'Manager Two' });
    const res = await POST(...post(CASE_ID, { working_status: 'in_progress' }));
    expect(res.status).toBe(201);
    await flushAsync();
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'outreach_case_update', recipientId: ASSIGNEE }),
    );
  });

  it('OTHER-agency manager gets an opaque 404 — no cross-agency write, no existence leak', async () => {
    sessionFor({ id: 'mgr-3', role: 'agency_manager', agency: 'GWI', name: 'Manager Three' });
    const res = await POST(...post(CASE_ID, { body: 'should not land' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Case not found'); // same body as a nonexistent case
    expect(mockInsertOfficerUpdate).not.toHaveBeenCalled();
  });

  it('superadmin may post on any agency case', async () => {
    sessionFor({ id: 'super-1', role: 'superadmin', agency: null, name: 'DG' });
    const res = await POST(...post(CASE_ID, { body: 'ministry note', target_date: '2026-08-15' }));
    expect(res.status).toBe(201);
    expect(mockInsertOfficerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ targetDate: '2026-08-15' }),
    );
  });

  it('unknown case → 404 (indistinguishable from out-of-scope)', async () => {
    sessionFor({ id: 'super-1', role: 'superadmin', agency: null });
    const res = await POST(...post(999, { body: 'hello' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Case not found');
  });

  it('empty update → 400; unauthenticated → auth-helper response passes through', async () => {
    sessionFor({ id: 'super-1', role: 'superadmin', agency: null });
    const emptyRes = await POST(...post(CASE_ID, {}));
    expect(emptyRes.status).toBe(400);

    // Shape-valid but impossible calendar date must be a 400, not a ::date 500.
    const badDateRes = await POST(...post(CASE_ID, { target_date: '2026-02-31' }));
    expect(badDateRes.status).toBe(400);

    mockRequireModuleAccess.mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    );
    const authRes = await POST(...post(CASE_ID, { body: 'x' }));
    expect(authRes.status).toBe(401);
  });
});
