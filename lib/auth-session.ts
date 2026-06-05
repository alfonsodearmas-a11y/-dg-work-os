// P3 / STEP 0b — PURE, dependency-free session-shape logic.
//
// Shared by the reimplemented Supabase auth() (lib/auth-supabase.ts) and the
// STEP 0b contract test. This module deliberately has NO `server-only` and NO
// Supabase/db imports so it stays importable from vitest and is safe anywhere.
// The only import is type-only (erased at compile), so nothing server-side leaks.

import type { Role } from '@/lib/auth';

/** The exact keys the NextAuth session.user exposed (enumerated from real reads:
 *  id ×302, role ×169, agency ×93, name ×24, email ×11, image ×1). */
export const SESSION_FIELDS = ['id', 'email', 'name', 'image', 'role', 'agency'] as const;
export type SessionField = (typeof SESSION_FIELDS)[number];

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: Role;
  agency: string | null;
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
}

/**
 * Pure mapping from (Supabase auth user id, public.users profile) → Session,
 * preserving the EXACT shape the NextAuth session produced. Returns null for the
 * same cases the current jwt/session callbacks treat as "no session":
 *   - no authenticated id
 *   - profile missing
 *   - deactivated (`!is_active`) unless still `'pending'` (mid-onboarding invite)
 *   - the unmodeled `'system'` role (outside the Role union; never a human session)
 */
export function buildSession(
  uid: string | null | undefined,
  profile: ProfileRow | null | undefined,
): Session | null {
  if (!uid) return null;
  if (!profile) return null;
  if (!profile.is_active && profile.status !== 'pending') return null;
  if (profile.role === 'system') return null;
  return {
    user: {
      id: uid,
      email: profile.email ?? '',
      name: profile.name ?? '',
      image: profile.avatar_url ?? null,
      role: profile.role as Role,
      // UPPERCASED to match AGENCY_CODES — Sidebar/agency filters depend on this,
      // exactly as the current NextAuth session callback does (lib/auth.ts:276).
      agency: profile.agency ? profile.agency.toUpperCase() : null,
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
