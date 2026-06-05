// PURE, dependency-free session-shape logic.
//
// Shared by the Supabase auth() (lib/auth-supabase.ts) and the contract test.
// This module deliberately has NO `server-only` and NO Supabase/db imports so it
// stays importable from vitest and is safe anywhere.
//
// PHASE 2 (role simplification, docs/role-simplification-plan.md): the app runs
// the TWO-LEVEL permission model (superadmin | agency_manager) while the DB
// still stores the legacy role values. `normalizeRole()` is the safety device:
// every read of users.role goes through it, so code and DB can flip
// independently. Phase 3 rewrites the stored values; normalization then
// becomes identity and is removed in cleanup.

import type { Role } from '@/lib/auth';

/** The exact keys session.user exposes. Phase 2 adds `title` (display-only). */
export const SESSION_FIELDS = ['id', 'email', 'name', 'image', 'role', 'agency', 'title'] as const;
export type SessionField = (typeof SESSION_FIELDS)[number];

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: Role;
  agency: string | null;
  /** Display title (formal_title) — e.g. "Director General". NEVER gates access. */
  title: string | null;
}

export interface Session {
  user: SessionUser;
}

/** The public.users columns auth() reads to build a session. */
export interface ProfileRow {
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  role: string;
  agency: string | null;
  is_active: boolean;
  status: string | null;
  formal_title: string | null;
}

/**
 * Map a stored role value (legacy 6-role world OR new two-level world) to the
 * two-level permission model. Returns null for 'system' and anything unknown —
 * callers treat that as "no session" / "no access".
 */
export function normalizeRole(stored: string | null | undefined): Role | null {
  switch (stored) {
    case 'superadmin':
    case 'dg':
    case 'minister':
    case 'ps':
    case 'parl_sec':
      return 'superadmin';
    case 'agency_manager':
    case 'agency_admin':
    case 'officer':
      return 'agency_manager';
    default:
      return null;
  }
}

/**
 * Map a two-level role to a value the CURRENT users_role_check accepts.
 * Phase 2 only: the DB CHECK still allows only legacy values, so role WRITES
 * (invite, role change) store the legacy equivalent; reads re-normalize.
 * Phase 3 flips the stored values + CHECK, after which this becomes identity
 * and is deleted.
 */
export function denormalizeRoleForWrite(role: Role): string {
  return role === 'superadmin' ? 'dg' : 'agency_admin';
}

/**
 * Pure mapping from (Supabase auth user id, public.users profile) → Session.
 * Returns null for:
 *   - no authenticated id
 *   - profile missing
 *   - deactivated (`!is_active`) unless still `'pending'` (mid-onboarding invite)
 *   - the unmodeled `'system'` role / any unknown role value
 */
export function buildSession(
  uid: string | null | undefined,
  profile: ProfileRow | null | undefined,
): Session | null {
  if (!uid) return null;
  if (!profile) return null;
  if (!profile.is_active && profile.status !== 'pending') return null;

  const role = normalizeRole(profile.role);
  if (!role) return null;

  return {
    user: {
      id: uid,
      email: profile.email ?? '',
      name: profile.name ?? '',
      image: profile.avatar_url ?? null,
      role,
      // UPPERCASED to match AGENCY_CODES — Sidebar/agency filters depend on this.
      agency: profile.agency ? profile.agency.toUpperCase() : null,
      title: profile.formal_title ?? null,
    },
  };
}

/** Runtime guard: asserts a built session has EXACTLY the contract key set. */
export function assertSessionShape(s: Session): true {
  const keys = Object.keys(s.user).sort();
  const expected = [...SESSION_FIELDS].sort();
  const drift = keys.length !== expected.length || keys.some((k, i) => k !== expected[i]);
  if (drift) {
    throw new Error(
      `Session user shape drift: got [${keys.join(',')}], expected [${expected.join(',')}]`,
    );
  }
  return true;
}
