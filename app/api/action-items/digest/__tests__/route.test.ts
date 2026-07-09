import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockAuth, mockFrom, mockInsertNotification, mockBuildDigest } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
  mockInsertNotification: vi.fn().mockResolvedValue(undefined),
  mockBuildDigest: vi.fn().mockResolvedValue({
    date_range: { start: '2026-05-03T00:00:00Z', end: '2026-05-04T00:00:00Z' },
    observed: 0, extracted: 0, queued: 0, skipped: 0, failed: 0,
    by_type: {}, by_modality: {}, failed_extraction_count: 0,
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));
vi.mock('@/lib/notifications', () => ({ insertNotification: mockInsertNotification }));
vi.mock('@/lib/action-items/digest', () => ({
  buildDailyDigest: mockBuildDigest,
  formatDigestBody: () => 'test body',
}));

import { GET } from '@/app/api/action-items/digest/route';

function reqWithAuth(token: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = token;
  return new NextRequest(new URL('http://localhost:3000/api/action-items/digest'), { headers });
}

describe('GET /api/action-items/digest — recipient gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(null);
    process.env.CRON_SECRET = 'test-secret';
  });

  it('queries active superadmins only (two-level model)', async () => {
    const roleEqSpy = vi.fn();
    const activeEqSpy = vi.fn().mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: roleEqSpy }),
    });
    // The chain is: from('users').select('id').eq('role', ...).eq('is_active', ...)
    roleEqSpy.mockReturnValue({ eq: activeEqSpy });

    const res = await GET(reqWithAuth('Bearer test-secret'));
    expect(res.status).toBe(200);

    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(roleEqSpy).toHaveBeenCalledWith('role', 'superadmin');
    expect(activeEqSpy).toHaveBeenCalledWith('is_active', true);
  });

  it('pushes a notification per recipient', async () => {
    const recipients = [
      { id: 'u-dg' }, { id: 'u-minister' }, { id: 'u-ps' }, { id: 'u-parl-sec' },
    ];
    const roleEqSpy = vi.fn();
    const activeEqSpy = vi.fn().mockResolvedValue({ data: recipients, error: null });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: roleEqSpy }),
    });
    roleEqSpy.mockReturnValue({ eq: activeEqSpy });

    const res = await GET(reqWithAuth('Bearer test-secret'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.pushed).toBe(4);
    expect(mockInsertNotification).toHaveBeenCalledTimes(4);
    const userIdsPushed = mockInsertNotification.mock.calls.map(c => (c[0] as { user_id: string }).user_id);
    expect(userIdsPushed.sort()).toEqual(['u-dg', 'u-minister', 'u-parl-sec', 'u-ps']);
  });

  it('rejects unauthenticated callers', async () => {
    const res = await GET(reqWithAuth(null));
    expect(res.status).toBe(401);
  });

  it('rejects officer session (only dg session may trigger ad-hoc)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-officer', role: 'officer' } });
    const res = await GET(reqWithAuth(null));
    expect(res.status).toBe(401);
  });
});
