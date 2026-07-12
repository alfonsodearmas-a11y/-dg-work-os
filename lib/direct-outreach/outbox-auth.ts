// OP Direct outbox — route auth (kept OUT of outbox.ts so the data layer that
// queries.ts imports never drags the session/auth chain into its import graph).

import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { constantTimeCompare } from '@/lib/constant-time';

/**
 * True when the request carries the shared bridge secret. Missing env or header
 * always denies (the caller then falls back to the superadmin session check).
 */
export function isBridgeAuthorized(request: NextRequest): boolean {
  const secret = process.env.BRIDGE_TOKEN?.trim();
  const token = request.headers.get('x-bridge-token');
  if (!secret || !token) return false;
  return constantTimeCompare(token, secret);
}

/**
 * Auth preamble for the bridge-facing routes (export/ack/fail): a valid
 * x-bridge-token header OR a superadmin session. Returns the denial response,
 * or null when authorized.
 */
export async function requireBridgeOrSuperadmin(request: NextRequest): Promise<NextResponse | null> {
  if (isBridgeAuthorized(request)) return null;
  const authResult = await requireRole(['superadmin']);
  return authResult instanceof NextResponse ? authResult : null;
}
