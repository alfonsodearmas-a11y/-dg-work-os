import { NextRequest } from 'next/server';
import { auth } from './auth-supabase';
import { MINISTRY_ROLES } from './people-types';

// ── Auth ──────────────────────────────────────────────────────────────
// Supabase Auth (GoTrue) owns sessions. `auth()` is implemented in
// lib/auth-supabase.ts; this module re-exports it as the canonical `@/lib/auth`
// import used by the ~47 server call-sites, and keeps the `Role` type plus the
// legacy shims still used by a few old admin/tm routes.
//
// CANONICAL PATTERN for new API routes: `requireRole()` from `lib/auth-helpers.ts`.
// LEGACY SHIMS (being phased out): authenticateAny(), authenticateFromCookie(),
// authorizeRoles(), isDG(), isCEO(), canAccessTask(). Do NOT use in new code.
// ──────────────────────────────────────────────────────────────────────

export type Role = 'dg' | 'minister' | 'ps' | 'parl_sec' | 'agency_admin' | 'officer';

// The single source of truth for the session accessor (Supabase-backed).
export { auth };

// ── Backward-compatible shims for old admin/tm routes ──────────────────
// Bridge the old user-object auth API onto the Supabase session.

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

interface LegacyUser {
  id: string;
  email: string;
  name: string;
  fullName: string;
  full_name: string;
  role: string;
  agency: string | null;
}

async function getSessionUser(): Promise<LegacyUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthError('Authentication required', 401);
  }
  const name = session.user.name || '';
  return {
    id: session.user.id,
    email: session.user.email,
    name,
    fullName: name,
    full_name: name,
    role: session.user.role,
    agency: session.user.agency,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function authenticateRequest(_request: NextRequest): Promise<LegacyUser> {
  return getSessionUser();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function authenticateAny(_request: NextRequest): Promise<LegacyUser> {
  return getSessionUser();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function authenticateFromCookie(_request: NextRequest): Promise<LegacyUser> {
  return getSessionUser();
}

export function isDG(user: LegacyUser): boolean {
  return user.role === 'dg';
}

export function isCEO(user: LegacyUser): boolean {
  return user.role === 'dg';
}

export function canAccessTask(user: LegacyUser, task: { assignee_id?: string; created_by?: string; agency?: string }): boolean {
  if (MINISTRY_ROLES.includes(user.role)) return true;
  if (task.assignee_id === user.id || task.created_by === user.id) return true;
  if (user.role === 'agency_admin' && task.agency && user.agency === task.agency) return true;
  return false;
}

export function authorizeRoles(user: LegacyUser, ...roles: string[]): void {
  // Map old role names to new ones
  const roleMap: Record<string, string[]> = {
    director: ['dg'],
    admin: ['dg', 'agency_admin'],
    officer: ['officer'],
    minister: ['minister'],
    ps: ['ps', 'parl_sec'],
    parl_sec: ['parl_sec'],
  };

  const allowedNewRoles = roles.flatMap(r => roleMap[r] || [r]);
  if (!allowedNewRoles.includes(user.role)) {
    throw new AuthError('Insufficient permissions', 403);
  }
}
