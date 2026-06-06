// PURE, dependency-free session-shape logic.
//
// Shared by the Supabase auth() (lib/auth-supabase.ts) and the contract test.
// This module deliberately has NO `server-only` and NO Supabase/db imports so it
// stays importable from vitest and is safe anywhere.
//
// PHASE 3 (role simplification, docs/role-simplification-plan.md): the DB now
// stores the two-level values directly (migration 128). `normalizeRole()` is a
// strict validator — anything outside the two-level model (incl. 'system' and
// unknown values) resolves to null, which callers treat as "no session"/"no
// access".

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
 * Strict role validation: the stored value IS the two-level role (post
 * migration 128). Returns null for 'system' and anything unknown — callers
 * treat that as "no session" / "no access".
 */
export function normalizeRole(stored: string | null | undefined): Role | null {
  if (stored === 'superadmin' || stored === 'agency_manager') return stored;
  return null;
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
