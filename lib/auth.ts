import jwt from 'jsonwebtoken';
import { query } from './db-pg';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || '';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: string;
  agency: string;
  mustChangePassword: boolean;
}

// ── Role helpers ────────────────────────────────────────────────────────────

export function isDG(user: AuthUser): boolean {
  return user.role === 'director' || user.role === 'admin';
}

export function isCEO(user: AuthUser): boolean {
  return user.role === 'ceo';
}

export function canAccessTask(user: AuthUser, task: { assignee_id: string; agency: string }): boolean {
  if (isDG(user)) return true;
  if (user.id === task.assignee_id) return true;
  if (isCEO(user) && user.agency === task.agency) return true;
  return false;
}

// ── Cookie-based auth (for task management pages) ───────────────────────────

export async function authenticateFromCookie(request: NextRequest): Promise<AuthUser> {
  const token = request.cookies.get('tm-token')?.value;

  if (!token) {
    throw new AuthError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new AuthError('Token expired', 401, 'TOKEN_EXPIRED');
    }
    throw new AuthError('Invalid token', 401, 'INVALID_TOKEN');
  }

  const result = await query(
    `SELECT id, username, email, full_name, role, agency, is_active, must_change_password
     FROM users WHERE id = $1`,
    [decoded.userId]
  );

  if (result.rows.length === 0) {
    throw new AuthError('User not found', 401, 'USER_NOT_FOUND');
  }

  const user = result.rows[0];
  if (!user.is_active) {
    throw new AuthError('Account is deactivated', 401, 'ACCOUNT_DEACTIVATED');
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    agency: user.agency,
    mustChangePassword: user.must_change_password,
  };
}

/** Authenticate from Bearer header, tm-token cookie, OR dg-auth access code cookie */
export async function authenticateAny(request: NextRequest): Promise<AuthUser> {
  // 1. Try Bearer token
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authenticateRequest(request);
  }

  // 2. Try tm-token JWT cookie
  const tmToken = request.cookies.get('tm-token')?.value;
  if (tmToken) {
    return authenticateFromCookie(request);
  }

  // 3. Fallback: dg-auth access code cookie → look up director user
  return authenticateFromAccessCode(request);
}

/** Authenticate via dg-auth access code cookie — resolves to the director user */
async function authenticateFromAccessCode(request: NextRequest): Promise<AuthUser> {
  const accessCode = process.env.APP_ACCESS_CODE;
  const authCookie = request.cookies.get('dg-auth')?.value;

  if (!accessCode || !authCookie) {
    throw new AuthError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  // Verify cookie hash matches
  const { createHash } = await import('crypto');
  const expectedToken = createHash('sha256').update(accessCode + '_dg_work_os').digest('hex');

  if (authCookie !== expectedToken) {
    throw new AuthError('Invalid access code', 401, 'INVALID_TOKEN');
  }

  // Look up the director user
  const result = await query(
    `SELECT id, username, email, full_name, role, agency, is_active, must_change_password
     FROM users WHERE role = 'director' AND is_active = true LIMIT 1`
  );

  if (result.rows.length === 0) {
    throw new AuthError('Director user not found', 401, 'USER_NOT_FOUND');
  }

  const user = result.rows[0];
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    agency: user.agency,
    mustChangePassword: user.must_change_password,
  };
}

export class AuthError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function authenticateRequest(request: NextRequest): Promise<AuthUser> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const token = authHeader.split(' ')[1];

  let decoded: any;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new AuthError('Token expired', 401, 'TOKEN_EXPIRED');
    }
    throw new AuthError('Invalid token', 401, 'INVALID_TOKEN');
  }

  const result = await query(
    `SELECT id, username, email, full_name, role, agency, is_active, must_change_password
     FROM users WHERE id = $1`,
    [decoded.userId]
  );

  if (result.rows.length === 0) {
    throw new AuthError('User not found', 401, 'USER_NOT_FOUND');
  }

  const user = result.rows[0];

  if (!user.is_active) {
    throw new AuthError('Account is deactivated', 401, 'ACCOUNT_DEACTIVATED');
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    agency: user.agency,
    mustChangePassword: user.must_change_password,
  };
}

export function authorizeRoles(user: AuthUser, ...allowedRoles: string[]): void {
  if (!allowedRoles.includes(user.role)) {
    throw new AuthError('Insufficient permissions', 403, 'FORBIDDEN');
  }
}

export function authorizeAgency(user: AuthUser, requestedAgency?: string): void {
  if (['director', 'admin'].includes(user.role) || user.agency === 'ministry') {
    return;
  }
  if (requestedAgency && user.agency !== requestedAgency.toLowerCase()) {
    throw new AuthError('Access denied to this agency', 403, 'AGENCY_ACCESS_DENIED');
  }
}

export function requirePasswordChange(user: AuthUser, currentPath: string): void {
  if (user.mustChangePassword && currentPath !== '/api/auth/change-password') {
    throw new AuthError('Password change required', 403, 'PASSWORD_CHANGE_REQUIRED');
  }
}
