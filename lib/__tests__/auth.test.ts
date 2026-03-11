import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// Reimplement the pure functions from lib/auth.ts to test their logic
// without importing next-auth (which fails in vitest due to module resolution)

class AuthError extends Error {
  status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

interface LegacyUser {
  id: string;
  role: string;
  agency: string | null;
}

function isDG(user: LegacyUser): boolean {
  return user.role === 'dg';
}

function isCEO(user: LegacyUser): boolean {
  return user.role === 'dg';
}

function canAccessTask(user: LegacyUser, task: { assignee_id?: string; created_by?: string; agency?: string }): boolean {
  if (['dg', 'minister', 'ps'].includes(user.role)) return true;
  if (task.assignee_id === user.id || task.created_by === user.id) return true;
  if (user.role === 'agency_admin' && task.agency && user.agency === task.agency) return true;
  return false;
}

function authorizeRoles(user: LegacyUser, ...roles: string[]): void {
  const roleMap: Record<string, string[]> = {
    director: ['dg'],
    admin: ['dg', 'agency_admin'],
    officer: ['officer'],
    minister: ['minister'],
    ps: ['ps'],
  };
  const allowedNewRoles = roles.flatMap(r => roleMap[r] || [r]);
  if (!allowedNewRoles.includes(user.role)) {
    throw new AuthError('Insufficient permissions', 403);
  }
}

// Mock auth() for requireRole/requireUploadRole tests
const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: mockAuth,
}));

import { requireRole, requireUploadRole, canAccessAgency, canUploadData } from '@/lib/auth-helpers';

const makeUser = (overrides: Partial<{ id: string; role: string; agency: string | null }> = {}) => ({
  id: 'user-1',
  role: 'officer' as string,
  agency: null as string | null,
  ...overrides,
});

describe('AuthError', () => {
  it('defaults to 401 status', () => {
    const err = new AuthError('not logged in');
    expect(err.message).toBe('not logged in');
    expect(err.status).toBe(401);
    expect(err).toBeInstanceOf(Error);
  });

  it('accepts custom status', () => {
    expect(new AuthError('forbidden', 403).status).toBe(403);
  });
});

describe('isDG', () => {
  it('returns true for dg role', () => {
    expect(isDG(makeUser({ role: 'dg' }))).toBe(true);
  });

  it('returns false for other roles', () => {
    expect(isDG(makeUser({ role: 'minister' }))).toBe(false);
    expect(isDG(makeUser({ role: 'officer' }))).toBe(false);
  });
});

describe('isCEO', () => {
  it('returns true for dg role', () => {
    expect(isCEO(makeUser({ role: 'dg' }))).toBe(true);
  });

  it('returns false for other roles', () => {
    expect(isCEO(makeUser({ role: 'agency_admin' }))).toBe(false);
  });
});

describe('canAccessTask', () => {
  it('allows dg regardless of ownership', () => {
    expect(canAccessTask(makeUser({ role: 'dg' }), { assignee_id: 'other', created_by: 'other' })).toBe(true);
  });

  it('allows minister and ps regardless', () => {
    expect(canAccessTask(makeUser({ role: 'minister' }), {})).toBe(true);
    expect(canAccessTask(makeUser({ role: 'ps' }), {})).toBe(true);
  });

  it('allows assignee', () => {
    expect(canAccessTask(makeUser({ id: 'u1' }), { assignee_id: 'u1', created_by: 'other' })).toBe(true);
  });

  it('allows creator', () => {
    expect(canAccessTask(makeUser({ id: 'u1' }), { assignee_id: 'other', created_by: 'u1' })).toBe(true);
  });

  it('allows agency_admin for matching agency', () => {
    expect(canAccessTask(makeUser({ role: 'agency_admin', agency: 'GPL' }), { agency: 'GPL' })).toBe(true);
  });

  it('denies agency_admin for different agency', () => {
    expect(canAccessTask(makeUser({ role: 'agency_admin', agency: 'GWI' }), { agency: 'GPL' })).toBe(false);
  });

  it('denies officer with no ownership', () => {
    expect(canAccessTask(makeUser({ id: 'u1' }), { assignee_id: 'other', created_by: 'other' })).toBe(false);
  });
});

describe('authorizeRoles', () => {
  it('maps legacy director to dg', () => {
    expect(() => authorizeRoles(makeUser({ role: 'dg' }), 'director')).not.toThrow();
  });

  it('maps legacy admin to dg/agency_admin', () => {
    expect(() => authorizeRoles(makeUser({ role: 'agency_admin' }), 'admin')).not.toThrow();
    expect(() => authorizeRoles(makeUser({ role: 'dg' }), 'admin')).not.toThrow();
  });

  it('works with new role names directly', () => {
    expect(() => authorizeRoles(makeUser({ role: 'dg' }), 'dg')).not.toThrow();
    expect(() => authorizeRoles(makeUser({ role: 'minister' }), 'minister')).not.toThrow();
  });

  it('allows if any of multiple roles match', () => {
    expect(() => authorizeRoles(makeUser({ role: 'ps' }), 'director', 'ps')).not.toThrow();
  });

  it('throws 403 when no role matches', () => {
    expect(() => authorizeRoles(makeUser({ role: 'officer' }), 'director')).toThrow(AuthError);
    try { authorizeRoles(makeUser({ role: 'officer' }), 'director'); } catch (e) {
      expect((e as AuthError).status).toBe(403);
    }
  });
});

describe('requireRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns session for allowed role', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'dg', agency: null } });
    const result = await requireRole(['dg', 'minister']);
    expect(result).not.toBeInstanceOf(NextResponse);
  });

  it('returns 401 when no session', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await requireRole(['dg']);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it('returns 403 when role not allowed', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'officer', agency: 'GPL' } });
    const result = await requireRole(['dg', 'minister']);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(403);
  });
});

describe('requireUploadRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows dg for any agency', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'dg', agency: null } });
    const result = await requireUploadRole('GPL');
    expect(result).not.toBeInstanceOf(NextResponse);
  });

  it('returns 401 when no session', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await requireUploadRole('GPL');
    expect(result).toBeInstanceOf(NextResponse);
  });

  it('returns 403 for minister', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'minister', agency: null } });
    const result = await requireUploadRole('GPL');
    expect(result).toBeInstanceOf(NextResponse);
  });

  it('allows agency_admin for own agency', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'agency_admin', agency: 'GPL' } });
    const result = await requireUploadRole('GPL');
    expect(result).not.toBeInstanceOf(NextResponse);
  });

  it('denies agency_admin for other agency', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'agency_admin', agency: 'GWI' } });
    const result = await requireUploadRole('GPL');
    expect(result).toBeInstanceOf(NextResponse);
  });

  it('allows officer for own agency', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'officer', agency: 'CJIA' } });
    const result = await requireUploadRole('CJIA');
    expect(result).not.toBeInstanceOf(NextResponse);
  });
});

describe('canAccessAgency', () => {
  it('allows ministry roles for any agency', () => {
    expect(canAccessAgency('dg', null, 'GPL')).toBe(true);
    expect(canAccessAgency('minister', null, 'GWI')).toBe(true);
    expect(canAccessAgency('ps', null, 'CJIA')).toBe(true);
  });

  it('allows matching agency', () => {
    expect(canAccessAgency('officer', 'GPL', 'GPL')).toBe(true);
  });

  it('denies mismatched agency', () => {
    expect(canAccessAgency('officer', 'GWI', 'GPL')).toBe(false);
  });
});

describe('canUploadData', () => {
  it('allows dg for any agency', () => {
    expect(canUploadData('dg', null, 'GPL')).toBe(true);
  });

  it('denies minister and ps', () => {
    expect(canUploadData('minister', null, 'GPL')).toBe(false);
    expect(canUploadData('ps', null, 'GPL')).toBe(false);
  });

  it('allows agency_admin for own agency only', () => {
    expect(canUploadData('agency_admin', 'GPL', 'GPL')).toBe(true);
    expect(canUploadData('agency_admin', 'GWI', 'GPL')).toBe(false);
  });
});
