import { describe, it, expect } from 'vitest';
import {
  buildSession,
  assertSessionShape,
  normalizeRole,
  denormalizeRoleForWrite,
  SESSION_FIELDS,
  type ProfileRow,
} from '@/lib/auth-session';

// The auth() contract lock — Phase 2 (role simplification).
// Asserts the session shape the 327 requireRole() routes + useSession callsites
// + ViewAsProvider depend on, INCLUDING the read-time normalization that lets
// the two-level code run against the still-legacy DB role values.

const baseProfile: ProfileRow = {
  email: 'user@mpua.gov.gy',
  name: 'Test User',
  avatar_url: 'https://example.com/a.png',
  role: 'agency_admin', // legacy stored value — MUST normalize to agency_manager
  agency: 'gpl', // stored lowercase historically — MUST come out uppercase
  is_active: true,
  status: 'active',
  formal_title: 'Agency Manager',
};

describe('auth() session contract (buildSession)', () => {
  it('returns exactly the contract session-user shape for an active user', () => {
    const s = buildSession('uid-1', baseProfile);
    expect(s).not.toBeNull();
    expect(Object.keys(s!.user).sort()).toEqual([...SESSION_FIELDS].sort());
    expect(s!.user).toEqual({
      id: 'uid-1',
      email: 'user@mpua.gov.gy',
      name: 'Test User',
      image: 'https://example.com/a.png',
      role: 'agency_manager', // NORMALIZED from legacy 'agency_admin'
      agency: 'GPL', // UPPERCASED
      title: 'Agency Manager',
    });
  });

  it('normalizes every legacy senior role to superadmin', () => {
    for (const legacy of ['dg', 'minister', 'ps', 'parl_sec']) {
      const s = buildSession('u', { ...baseProfile, role: legacy, agency: null });
      expect(s!.user.role).toBe('superadmin');
    }
  });

  it('normalizes every legacy agency role to agency_manager', () => {
    for (const legacy of ['agency_admin', 'officer']) {
      const s = buildSession('u', { ...baseProfile, role: legacy });
      expect(s!.user.role).toBe('agency_manager');
    }
  });

  it('passes the new two-level values through unchanged (post-Phase-3 identity)', () => {
    expect(buildSession('u', { ...baseProfile, role: 'superadmin', agency: null })!.user.role).toBe('superadmin');
    expect(buildSession('u', { ...baseProfile, role: 'agency_manager' })!.user.role).toBe('agency_manager');
  });

  it('exposes formal_title as title, with null coercion', () => {
    expect(buildSession('u', baseProfile)!.user.title).toBe('Agency Manager');
    expect(buildSession('u', { ...baseProfile, formal_title: null })!.user.title).toBeNull();
  });

  it('title never affects role (a superadmin may carry any title)', () => {
    const s = buildSession('u', { ...baseProfile, role: 'dg', agency: null, formal_title: 'Analyst' });
    expect(s!.user.role).toBe('superadmin');
    expect(s!.user.title).toBe('Analyst');
  });

  it('uppercases agency (Sidebar/agency filters depend on it)', () => {
    expect(buildSession('u', { ...baseProfile, agency: 'cjia' })!.user.agency).toBe('CJIA');
    expect(buildSession('u', { ...baseProfile, agency: 'GWI' })!.user.agency).toBe('GWI');
  });

  it('passes assertSessionShape for a built session', () => {
    expect(assertSessionShape(buildSession('u', baseProfile)!)).toBe(true);
  });

  it('coerces null name/avatar/email to the contract types', () => {
    const s = buildSession('u', { ...baseProfile, name: null, avatar_url: null, email: null });
    expect(s!.user.name).toBe('');
    expect(s!.user.image).toBeNull();
    expect(s!.user.email).toBe('');
  });

  it('superadmins keep null agency', () => {
    const s = buildSession('u', { ...baseProfile, role: 'dg', agency: null });
    expect(s!.user.role).toBe('superadmin');
    expect(s!.user.agency).toBeNull();
  });

  it('returns null when there is no authenticated id', () => {
    expect(buildSession(null, baseProfile)).toBeNull();
    expect(buildSession(undefined, baseProfile)).toBeNull();
    expect(buildSession('', baseProfile)).toBeNull();
  });

  it('returns null when the profile is missing', () => {
    expect(buildSession('uid', null)).toBeNull();
    expect(buildSession('uid', undefined)).toBeNull();
  });

  it('returns null for a deactivated user (is_active=false, non-pending status)', () => {
    expect(buildSession('uid', { ...baseProfile, is_active: false, status: 'active' })).toBeNull();
    expect(buildSession('uid', { ...baseProfile, is_active: false, status: 'suspended' })).toBeNull();
    expect(buildSession('uid', { ...baseProfile, is_active: false, status: 'archived' })).toBeNull();
  });

  it('resolves for a pending (invited, not-yet-logged-in) user — mid-onboarding', () => {
    const s = buildSession('uid', { ...baseProfile, is_active: false, status: 'pending' });
    expect(s).not.toBeNull();
    expect(s!.user.role).toBe('agency_manager');
  });

  it("returns null for the unmodeled 'system' role and unknown role values", () => {
    expect(
      buildSession('uid', { ...baseProfile, role: 'system', agency: null }),
    ).toBeNull();
    expect(
      buildSession('uid', { ...baseProfile, role: 'something_else' }),
    ).toBeNull();
  });

  it('snapshots the exact key set so any drift fails CI', () => {
    expect([...SESSION_FIELDS]).toEqual(['id', 'email', 'name', 'image', 'role', 'agency', 'title']);
  });
});

describe('normalizeRole / denormalizeRoleForWrite', () => {
  it('maps each legacy value to its two-level role', () => {
    expect(normalizeRole('dg')).toBe('superadmin');
    expect(normalizeRole('minister')).toBe('superadmin');
    expect(normalizeRole('ps')).toBe('superadmin');
    expect(normalizeRole('parl_sec')).toBe('superadmin');
    expect(normalizeRole('agency_admin')).toBe('agency_manager');
    expect(normalizeRole('officer')).toBe('agency_manager');
  });

  it('is identity for two-level values and null for everything else', () => {
    expect(normalizeRole('superadmin')).toBe('superadmin');
    expect(normalizeRole('agency_manager')).toBe('agency_manager');
    expect(normalizeRole('system')).toBeNull();
    expect(normalizeRole('')).toBeNull();
    expect(normalizeRole(null)).toBeNull();
    expect(normalizeRole(undefined)).toBeNull();
  });

  it('denormalizes writes to values the current users_role_check accepts (Phase 2 only)', () => {
    expect(denormalizeRoleForWrite('superadmin')).toBe('dg');
    expect(denormalizeRoleForWrite('agency_manager')).toBe('agency_admin');
    // round-trip: a write then a read lands on the same two-level role
    expect(normalizeRole(denormalizeRoleForWrite('superadmin'))).toBe('superadmin');
    expect(normalizeRole(denormalizeRoleForWrite('agency_manager'))).toBe('agency_manager');
  });
});
