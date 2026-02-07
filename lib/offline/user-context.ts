/**
 * User-aware cache key namespacing.
 *
 * DG views (no JWT, gate auth cookie): prefix = "dg"
 * Data entry / admin views (JWT in localStorage): prefix = decoded userId
 */

interface JWTPayload {
  userId?: string;
  sub?: string;
  id?: string;
}

/**
 * Decode a JWT payload without verification (client-side only — used for cache namespacing).
 */
function decodeJWTPayload(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Get the current user ID for cache namespacing.
 * Returns the JWT userId if logged in, or "dg" for gate-auth / unauthenticated DG views.
 */
export function getCacheUserId(): string {
  if (typeof window === 'undefined') return 'dg';

  const token = localStorage.getItem('token');
  if (!token) return 'dg';

  const payload = decodeJWTPayload(token);
  if (!payload) return 'dg';

  return payload.userId || payload.sub || payload.id || 'dg';
}

/**
 * Create a user-namespaced cache key.
 */
export function getCacheKey(base: string): string {
  const userId = getCacheUserId();
  return `${userId}:${base}`;
}
