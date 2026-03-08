import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: mockAuth,
}));

import { requireRole, canAccessAgency, canUploadData, canAssignTasks } from '@/lib/auth-helpers';

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns auth result when role matches', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'dg', agency: null },
    });

    const result = await requireRole(['dg']);
    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as any).session.user.role).toBe('dg');
  });

  it('returns 401 when no session', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await requireRole(['dg']);
    expect(result).toBeInstanceOf(NextResponse);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe('Authentication required');
  });

  it('returns 401 when session has no user id', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    const result = await requireRole(['dg']);
    expect(result).toBeInstanceOf(NextResponse);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe('Authentication required');
  });

  it('returns 403 when role is officer but dg required', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-2', role: 'officer', agency: 'GPL' },
    });

    const result = await requireRole(['dg']);
    expect(result).toBeInstanceOf(NextResponse);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe('Insufficient permissions');
  });

  it('allows multiple roles', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-3', role: 'ps', agency: null },
    });

    const result = await requireRole(['dg', 'minister', 'ps']);
    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as any).session.user.role).toBe('ps');
  });
});

describe('canAccessAgency', () => {
  it('returns true for dg regardless of agency', () => {
    expect(canAccessAgency('dg', null, 'GPL')).toBe(true);
  });

  it('returns true for minister regardless of agency', () => {
    expect(canAccessAgency('minister', null, 'GWI')).toBe(true);
  });

  it('returns true for ps regardless of agency', () => {
    expect(canAccessAgency('ps', null, 'CJIA')).toBe(true);
  });

  it('returns true for agency_admin with matching agency', () => {
    expect(canAccessAgency('agency_admin', 'GPL', 'GPL')).toBe(true);
  });

  it('returns true for case-insensitive agency match', () => {
    expect(canAccessAgency('agency_admin', 'gpl', 'GPL')).toBe(true);
  });

  it('returns false for agency_admin with non-matching agency', () => {
    expect(canAccessAgency('agency_admin', 'GWI', 'GPL')).toBe(false);
  });

  it('returns false for officer with non-matching agency', () => {
    expect(canAccessAgency('officer', 'CJIA', 'GPL')).toBe(false);
  });

  it('returns false for officer with null agency', () => {
    expect(canAccessAgency('officer', null, 'GPL')).toBe(false);
  });
});

describe('canUploadData', () => {
  it('returns true for dg regardless of agency', () => {
    expect(canUploadData('dg', null, 'GPL')).toBe(true);
  });

  it('returns false for minister', () => {
    expect(canUploadData('minister', null, 'GPL')).toBe(false);
  });

  it('returns false for ps', () => {
    expect(canUploadData('ps', null, 'GPL')).toBe(false);
  });

  it('returns true for agency_admin with matching agency', () => {
    expect(canUploadData('agency_admin', 'GPL', 'GPL')).toBe(true);
  });

  it('returns false for agency_admin with non-matching agency', () => {
    expect(canUploadData('agency_admin', 'GWI', 'GPL')).toBe(false);
  });

  it('returns true for officer with matching agency', () => {
    expect(canUploadData('officer', 'GPL', 'GPL')).toBe(true);
  });

  it('returns false for officer with non-matching agency', () => {
    expect(canUploadData('officer', 'GWI', 'GPL')).toBe(false);
  });
});

describe('canAssignTasks', () => {
  it('returns true for dg', () => {
    expect(canAssignTasks('dg')).toBe(true);
  });

  it('returns true for minister', () => {
    expect(canAssignTasks('minister')).toBe(true);
  });

  it('returns true for ps', () => {
    expect(canAssignTasks('ps')).toBe(true);
  });

  it('returns true for agency_admin', () => {
    expect(canAssignTasks('agency_admin')).toBe(true);
  });

  it('returns false for officer', () => {
    expect(canAssignTasks('officer')).toBe(false);
  });
});
