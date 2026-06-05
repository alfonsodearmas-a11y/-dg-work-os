import { describe, it, expect } from 'vitest';
import {
  buildSession,
  assertSessionShape,
  SESSION_FIELDS,
  type ProfileRow,
} from '@/lib/auth-session';

// STEP 0b — the auth() contract lock. These tests assert the reimplemented
// Supabase auth() produces a session structurally IDENTICAL to the NextAuth one,
// so the 249 requireRole() routes + 13 useSession() callsites + ViewAsProvider
// keep working unchanged. The pure `buildSession` is the testable core of auth().

const baseProfile: ProfileRow = {
  email: 'user@mpua.gov.gy',
  name: 'Test User',
  avatar_url: 'https://example.com/a.png',
  role: 'agency_admin',
  agency: 'gpl', // stored lowercase historically — MUST come out uppercase
  is_active: true,
  status: 'active',
};

describe('auth() session contract (buildSession)', () => {
  it('returns exactly the NextAuth session-user shape for an active user', () => {
    const s = buildSession('uid-1', baseProfile);
    expect(s).not.toBeNull();
    expect(Object.keys(s!.user).sort()).toEqual([...SESSION_FIELDS].sort());
    expect(s!.user).toEqual({
      id: 'uid-1',
      email: 'user@mpua.gov.gy',
      name: 'Test User',
      image: 'https://example.com/a.png',
      role: 'agency_admin',
      agency: 'GPL', // UPPERCASED
    });
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

  it('ministry roles keep null agency', () => {
    const s = buildSession('u', { ...baseProfile, role: 'dg', agency: null });
    expect(s!.user.role).toBe('dg');
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
    expect(s!.user.role).toBe('agency_admin');
  });

  it("returns null for the unmodeled 'system' role (outside the Role union)", () => {
    const s = buildSession('uid', {
      ...baseProfile,
      role: 'system',
      agency: null,
      is_active: true,
      status: 'active',
    });
    expect(s).toBeNull();
  });

  it('snapshots the exact key set so any drift fails CI', () => {
    expect([...SESSION_FIELDS]).toEqual(['id', 'email', 'name', 'image', 'role', 'agency']);
  });
});
