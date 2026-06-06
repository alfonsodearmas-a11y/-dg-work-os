import { describe, it, expect } from 'vitest';
import {
  buildSession,
  assertSessionShape,
  normalizeRole,
  SESSION_FIELDS,
  type ProfileRow,
} from '@/lib/auth-session';

// The auth() contract lock — Phase 3 (post DB flip, migration 128).
// The DB stores the two-level values directly; normalizeRole() is a strict
// validator. Legacy values no longer exist in the DB — if one ever appears,
// the safe behaviour is NO session (null), which these tests pin down.

const baseProfile: ProfileRow = {
  email: 'user@mpua.gov.gy',
  name: 'Test User',
  avatar_url: 'https://example.com/a.png',
  role: 'agency_manager',
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
      role: 'agency_manager',
      agency: 'GPL', // UPPERCASED
      title: 'Agency Manager',
    });
  });

  it('resolves both two-level roles directly', () => {
    expect(buildSession('u', { ...baseProfile, role: 'superadmin', agency: null })!.user.role).toBe('superadmin');
    expect(buildSession('u', { ...baseProfile, role: 'agency_manager' })!.user.role).toBe('agency_manager');
  });

  it('exposes formal_title as title, with null coercion', () => {
    expect(buildSession('u', baseProfile)!.user.title).toBe('Agency Manager');
    expect(buildSession('u', { ...baseProfile, formal_title: null })!.user.title).toBeNull();
  });

  it('title never affects role (a superadmin may carry any title)', () => {
    const s = buildSession('u', { ...baseProfile, role: 'superadmin', agency: null, formal_title: 'Analyst' });
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
    const s = buildSession('u', { ...baseProfile, role: 'superadmin', agency: null });
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

  it("returns null for 'system', retired legacy values, and unknowns — no session", () => {
    for (const value of ['system', 'dg', 'minister', 'ps', 'parl_sec', 'agency_admin', 'officer', 'something_else']) {
      expect(buildSession('uid', { ...baseProfile, role: value, agency: null })).toBeNull();
    }
  });

  it('snapshots the exact key set so any drift fails CI', () => {
    expect([...SESSION_FIELDS]).toEqual(['id', 'email', 'name', 'image', 'role', 'agency', 'title']);
  });
});

describe('normalizeRole (strict two-level validator)', () => {
  it('is identity for the two-level values', () => {
    expect(normalizeRole('superadmin')).toBe('superadmin');
    expect(normalizeRole('agency_manager')).toBe('agency_manager');
  });

  it('is null for everything else (system, retired legacy names, unknowns)', () => {
    for (const value of ['system', 'dg', 'minister', 'ps', 'parl_sec', 'agency_admin', 'officer', '', undefined, null]) {
      expect(normalizeRole(value as string | null | undefined)).toBeNull();
    }
  });
});
