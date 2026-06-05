import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// Reimplement the pure functions from lib/auth.ts to test their logic
// without importing next-auth (which fails in vitest due to module resolution).
// Phase 2 (role simplification): sessions carry the TWO-LEVEL roles
// (superadmin | agency_manager) — auth() normalizes legacy stored values.

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
  return user.role === 'superadmin';
}

function isCEO(user: LegacyUser): boolean {
  return user.role === 'superadmin';
}

function canAccessTask(user: LegacyUser, task: { assignee_id?: string; created_by?: string; agency?: string }): boolean {
  if (user.role === 'superadmin') return true;
  if (task.assignee_id === user.id || task.created_by === user.id) return true;
  if (user.role === 'agency_manager' && task.agency && user.agency === task.agency) return true;
  return false;
}

function authorizeRoles(user: LegacyUser, ...roles: string[]): void {
  const roleMap: Record<string, string[]> = {
    director: ['superadmin'],
    admin: ['superadmin', 'agency_manager'],
    officer: ['agency_manager'],
    minister: ['superadmin'],
    ps: ['superadmin'],
    parl_sec: ['superadmin'],
  };
  const allowedNewRoles = roles.flatMap(r => roleMap[r] || [r]);
  if (!allowedNewRoles.includes(user.role)) {
    throw new AuthError('Insufficient permissions', 403);
  }
}

// Mock auth() for requireRole/requireUploadRole tests. auth-helpers imports auth
// from '@/lib/auth' (the stable auth surface that re-exports the Supabase
// accessor), so mocking that module both controls auth() and keeps the real
// `server-only` import out of the vitest runtime.
const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: mockAuth,
}));

import { requireRole, requireUploadRole, canAccessAgency, canUploadData } from '@/lib/auth-helpers';

const makeUser = (overrides: Partial<{ id: string; role: string; agency: string | null }> = {}) => ({
  id: 'user-1',
  role: 'agency_manager' as string,
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
  it('returns true for superadmin', () => {
    expect(isDG(makeUser({ role: 'superadmin' }))).toBe(true);
  });

  it('returns false for agency_manager', () => {
    expect(isDG(makeUser({ role: 'agency_manager' }))).toBe(false);
  });
});

describe('isCEO', () => {
  it('returns true for superadmin', () => {
    expect(isCEO(makeUser({ role: 'superadmin' }))).toBe(true);
  });

  it('returns false for agency_manager', () => {
    expect(isCEO(makeUser({ role: 'agency_manager' }))).toBe(false);
  });
});

describe('canAccessTask', () => {
  it('allows superadmin regardless of ownership', () => {
    expect(canAccessTask(makeUser({ role: 'superadmin' }), { assignee_id: 'other', created_by: 'other' })).toBe(true);
  });

  it('allows assignee', () => {
    expect(canAccessTask(makeUser({ id: 'u1' }), { assignee_id: 'u1', created_by: 'other' })).toBe(true);
  });

  it('allows creator', () => {
    expect(canAccessTask(makeUser({ id: 'u1' }), { assignee_id: 'other', created_by: 'u1' })).toBe(true);
  });

  it('allows agency_manager for matching agency', () => {
    expect(canAccessTask(makeUser({ role: 'agency_manager', agency: 'GPL' }), { agency: 'GPL' })).toBe(true);
  });

  it('denies agency_manager for different agency', () => {
    expect(canAccessTask(makeUser({ role: 'agency_manager', agency: 'GWI' }), { agency: 'GPL' })).toBe(false);
  });

  it('denies agency_manager with no ownership and no agency match', () => {
    expect(canAccessTask(makeUser({ id: 'u1' }), { assignee_id: 'other', created_by: 'other' })).toBe(false);
  });
});

describe('authorizeRoles', () => {
  it('maps legacy director to superadmin', () => {
    expect(() => authorizeRoles(makeUser({ role: 'superadmin' }), 'director')).not.toThrow();
  });

  it('maps legacy admin to superadmin/agency_manager', () => {
    expect(() => authorizeRoles(makeUser({ role: 'agency_manager' }), 'admin')).not.toThrow();
    expect(() => authorizeRoles(makeUser({ role: 'superadmin' }), 'admin')).not.toThrow();
  });

  it('maps legacy senior names to superadmin', () => {
    expect(() => authorizeRoles(makeUser({ role: 'superadmin' }), 'minister')).not.toThrow();
    expect(() => authorizeRoles(makeUser({ role: 'superadmin' }), 'ps')).not.toThrow();
  });

  it('allows if any of multiple roles match', () => {
    expect(() => authorizeRoles(makeUser({ role: 'superadmin' }), 'director', 'ps')).not.toThrow();
  });

  it('throws 403 when no role matches', () => {
    expect(() => authorizeRoles(makeUser({ role: 'agency_manager' }), 'director')).toThrow(AuthError);
    try { authorizeRoles(makeUser({ role: 'agency_manager' }), 'director'); } catch (e) {
      expect((e as AuthError).status).toBe(403);
    }
  });
});

describe('requireRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns session for allowed role', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'superadmin', agency: null } });
    const result = await requireRole(['superadmin']);
    expect(result).not.toBeInstanceOf(NextResponse);
  });

  it('returns 401 when no session', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await requireRole(['superadmin']);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it('returns 403 when role not allowed', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'agency_manager', agency: 'GPL' } });
    const result = await requireRole(['superadmin']);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(403);
  });
});

describe('requireUploadRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows superadmin for any agency (D3 breadth)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'superadmin', agency: null } });
    const result = await requireUploadRole('GPL');
    expect(result).not.toBeInstanceOf(NextResponse);
  });

  it('returns 401 when no session', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await requireUploadRole('GPL');
    expect(result).toBeInstanceOf(NextResponse);
  });

  it('allows agency_manager for own agency', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'agency_manager', agency: 'GPL' } });
    const result = await requireUploadRole('GPL');
    expect(result).not.toBeInstanceOf(NextResponse);
  });

  it('denies agency_manager for other agency', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'agency_manager', agency: 'GWI' } });
    const result = await requireUploadRole('GPL');
    expect(result).toBeInstanceOf(NextResponse);
  });
});

describe('canAccessAgency', () => {
  it('allows superadmin for any agency', () => {
    expect(canAccessAgency('superadmin', null, 'GPL')).toBe(true);
    expect(canAccessAgency('superadmin', null, 'GWI')).toBe(true);
  });

  it('allows matching agency', () => {
    expect(canAccessAgency('agency_manager', 'GPL', 'GPL')).toBe(true);
  });

  it('denies mismatched agency', () => {
    expect(canAccessAgency('agency_manager', 'GWI', 'GPL')).toBe(false);
  });
});

describe('canUploadData', () => {
  it('allows superadmin for any agency (D3 breadth)', () => {
    expect(canUploadData('superadmin', null, 'GPL')).toBe(true);
  });

  it('allows agency_manager for own agency only', () => {
    expect(canUploadData('agency_manager', 'GPL', 'GPL')).toBe(true);
    expect(canUploadData('agency_manager', 'GWI', 'GPL')).toBe(false);
  });
});
