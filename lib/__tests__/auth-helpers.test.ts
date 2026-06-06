import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: mockAuth,
}));

import { requireRole, canAccessAgency, canUploadData, canAssignTasks } from '@/lib/auth-helpers';

// Phase 2 (role simplification): two permission levels. auth() returns
// NORMALIZED roles (superadmin | agency_manager) — the legacy values never
// reach requireRole or the helpers.

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns auth result when role matches', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'superadmin', agency: null },
    });

    const result = await requireRole(['superadmin']);
    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as any).session.user.role).toBe('superadmin');
  });

  it('returns 401 when no session', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await requireRole(['superadmin']);
    expect(result).toBeInstanceOf(NextResponse);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe('Authentication required');
  });

  it('returns 401 when session has no user id', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    const result = await requireRole(['superadmin']);
    expect(result).toBeInstanceOf(NextResponse);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe('Authentication required');
  });

  it('returns 403 when role is agency_manager but superadmin required', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-2', role: 'agency_manager', agency: 'GPL' },
    });

    const result = await requireRole(['superadmin']);
    expect(result).toBeInstanceOf(NextResponse);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe('Insufficient permissions');
  });

  it('allows multiple roles', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-3', role: 'agency_manager', agency: 'GWI' },
    });

    const result = await requireRole(['superadmin', 'agency_manager']);
    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as any).session.user.role).toBe('agency_manager');
  });
});

describe('canAccessAgency', () => {
  it('returns true for superadmin regardless of agency', () => {
    expect(canAccessAgency('superadmin', null, 'GPL')).toBe(true);
    expect(canAccessAgency('superadmin', null, 'GWI')).toBe(true);
    expect(canAccessAgency('superadmin', null, 'CJIA')).toBe(true);
  });

  it('returns true for agency_manager with matching agency', () => {
    expect(canAccessAgency('agency_manager', 'GPL', 'GPL')).toBe(true);
  });

  it('uppercases the target (canonical agency form is UPPERCASE)', () => {
    expect(canAccessAgency('agency_manager', 'GPL', 'gpl')).toBe(true);
  });

  it('returns false for agency_manager with non-matching agency', () => {
    expect(canAccessAgency('agency_manager', 'GWI', 'GPL')).toBe(false);
  });

  it('returns false for agency_manager with null agency', () => {
    expect(canAccessAgency('agency_manager', null, 'GPL')).toBe(false);
  });
});

describe('canUploadData', () => {
  it('returns true for superadmin regardless of agency (D3 breadth)', () => {
    expect(canUploadData('superadmin', null, 'GPL')).toBe(true);
  });

  it('returns true for agency_manager with matching agency', () => {
    expect(canUploadData('agency_manager', 'GPL', 'GPL')).toBe(true);
  });

  it('returns false for agency_manager with non-matching agency', () => {
    expect(canUploadData('agency_manager', 'GWI', 'GPL')).toBe(false);
  });

  it('returns false for agency_manager with null agency', () => {
    expect(canUploadData('agency_manager', null, 'GPL')).toBe(false);
  });
});

describe('canAssignTasks', () => {
  it('returns true for superadmin', () => {
    expect(canAssignTasks('superadmin')).toBe(true);
  });

  it('returns true for agency_manager (D2: ex-officers gain assignment)', () => {
    expect(canAssignTasks('agency_manager')).toBe(true);
  });
});
