// GET/PATCH /api/direct-outreach/[caseId] — cross-agency assignee access +
// superadmin assign-any-human. The REAL permission helpers run; auth and the
// data layer are mocked, with getCase mirroring the live visibility contract
// (agency scope OR requester-is-assignee).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockRequireModuleAccess,
  mockGetCase,
  mockGetUserForAssignment,
  mockSetAssignee,
  mockClearAssignee,
  mockCreateNotification,
} = vi.hoisted(() => ({
  mockRequireModuleAccess: vi.fn(),
  mockGetCase: vi.fn(),
  mockGetUserForAssignment: vi.fn(),
  mockSetAssignee: vi.fn(),
  mockClearAssignee: vi.fn(),
  mockCreateNotification: vi.fn(),
}));

vi.mock('@/lib/auth-helpers', () => ({
  requireModuleAccess: mockRequireModuleAccess,
}));

vi.mock('@/lib/direct-outreach/queries', () => ({
  getCase: mockGetCase,
  getUserForAssignment: mockGetUserForAssignment,
  setAssignee: mockSetAssignee,
  clearAssignee: mockClearAssignee,
}));

vi.mock('@/lib/notifications/notification-service', () => ({
  createNotification: mockCreateNotification,
}));

import { GET, PATCH } from '@/app/api/direct-outreach/[caseId]/route';

const CASE_ID = 7;
const ASSIGNEE = 'officer-1';

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

function req(method: string, body?: unknown): [NextRequest, { params: Promise<{ caseId: string }> }] {
  return [
    new NextRequest(new URL(`http://localhost:3000/api/direct-outreach/${CASE_ID}`), {
      method,
      ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
    }),
    { params: Promise.resolve({ caseId: String(CASE_ID) }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  // Live visibility contract: agency scope OR requester-is-assignee.
  mockGetCase.mockImplementation(async (id: number, scope?: string, requesterId?: string) =>
    id === CASE_ID && (scope === undefined || scope === 'GPL' || requesterId === ASSIGNEE)
      ? caseDetail()
      : null,
  );
  mockSetAssignee.mockResolvedValue(true);
  mockCreateNotification.mockResolvedValue(null);
});

describe('GET /api/direct-outreach/[caseId] — assignee visibility', () => {
  it('cross-agency ASSIGNEE opens their case (200)', async () => {
    sessionFor({ id: ASSIGNEE, role: 'agency_manager', agency: 'HECI' });
    const res = await GET(...req('GET'));
    expect(res.status).toBe(200);
    expect(mockGetCase).toHaveBeenCalledWith(CASE_ID, 'HECI', ASSIGNEE);
  });

  it('non-assignee other-agency manager still gets the opaque 404', async () => {
    sessionFor({ id: 'mgr-9', role: 'agency_manager', agency: 'GWI' });
    const res = await GET(...req('GET'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Case not found');
  });

  it('superadmin unscoped (200)', async () => {
    sessionFor({ id: 'super-1', role: 'superadmin', agency: null });
    const res = await GET(...req('GET'));
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/direct-outreach/[caseId] — superadmin assigns ANY human', () => {
  it('superadmin assigns a MARAD manager to a GPL case (200)', async () => {
    sessionFor({ id: 'super-1', role: 'superadmin', agency: null, name: 'DG' });
    mockGetUserForAssignment.mockResolvedValue({
      id: 'u-marad', name: 'Marad Officer', role: 'agency_manager', agency: 'MARAD', is_active: true,
    });
    const res = await PATCH(...req('PATCH', { assignee_user_id: '11111111-1111-4111-8111-111111111111' }));
    expect(res.status).toBe(200);
    expect(mockSetAssignee).toHaveBeenCalled();
  });

  it('superadmin cannot assign a system/service account (403)', async () => {
    sessionFor({ id: 'super-1', role: 'superadmin', agency: null });
    mockGetUserForAssignment.mockResolvedValue({
      id: 'u-bot', name: 'Cron Bot', role: 'system', agency: null, is_active: true,
    });
    const res = await PATCH(...req('PATCH', { assignee_user_id: '22222222-2222-4222-8222-222222222222' }));
    expect(res.status).toBe(403);
    expect(mockSetAssignee).not.toHaveBeenCalled();
  });

  it('agency_manager assigner keeps the Q3 rule: cross-agency target rejected (403)', async () => {
    sessionFor({ id: 'mgr-1', role: 'agency_manager', agency: 'GPL' });
    mockGetUserForAssignment.mockResolvedValue({
      id: 'u-marad', name: 'Marad Officer', role: 'agency_manager', agency: 'MARAD', is_active: true,
    });
    const res = await PATCH(...req('PATCH', { assignee_user_id: '11111111-1111-4111-8111-111111111111' }));
    expect(res.status).toBe(403);
    expect(mockSetAssignee).not.toHaveBeenCalled();
  });

  it('cross-agency ASSIGNEE can view but not reassign (403, not 404)', async () => {
    sessionFor({ id: ASSIGNEE, role: 'agency_manager', agency: 'HECI' });
    const res = await PATCH(...req('PATCH', { assignee_user_id: '11111111-1111-4111-8111-111111111111' }));
    expect(res.status).toBe(403);
  });
});
