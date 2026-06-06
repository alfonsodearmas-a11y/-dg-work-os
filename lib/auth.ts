import { NextRequest } from 'next/server';
import { auth } from './auth-supabase';

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

// PHASE 2 (role simplification): two permission levels. The DB still stores the
// legacy values (dg/minister/ps/parl_sec/agency_admin/officer); buildSession()
// normalizes on read. 'system' stays outside the union — session-incapable.
export type Role = 'superadmin' | 'agency_manager';

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
  return user.role === 'superadmin';
}

export function isCEO(user: LegacyUser): boolean {
  return user.role === 'superadmin';
}

export function canAccessTask(user: LegacyUser, task: { assignee_id?: string; created_by?: string; agency?: string }): boolean {
  if (user.role === 'superadmin') return true;
  if (task.assignee_id === user.id || task.created_by === user.id) return true;
  if (user.role === 'agency_manager' && task.agency && user.agency === task.agency) return true;
  return false;
}

export function authorizeRoles(user: LegacyUser, ...roles: string[]): void {
  // Map the legacy tm-route role names onto the two-level model.
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
