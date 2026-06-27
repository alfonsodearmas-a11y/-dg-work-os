// E2E-ONLY test-auth affordance. Lets Playwright render authenticated pages with a
// deterministic session (and fully-mocked APIs) WITHOUT real credentials or any DB
// contact. Pure (no `server-only`) so the middleware can import it too.
//
// BULLETPROOF GATE — this is DEAD in production:
//   - a production build (`next build`) sets NODE_ENV=production, which disables it
//     regardless of any env var, AND
//   - it additionally requires the explicit opt-in `E2E_AUTH_BYPASS=1`, which is
//     never set in any production environment.
// Both conditions must hold; either one failing leaves the real Supabase auth path
// completely untouched.

import { buildSession, type Session } from '@/lib/auth-session';

export function e2eAuthEnabled(): boolean {
  // DCE ANCHOR (must stay first): in a production build the bundler inlines
  // process.env.NODE_ENV === 'production' → true, folds this to `return false`,
  // and tree-shakes the whole affordance out of the bundle. Verified absent from
  // the executable prod build (AUTH_BYPASS_REVIEW.md) and guarded by
  // `npm run verify:no-bypass`.
  if (process.env.NODE_ENV === 'production') return false;
  // Belt: any production indicator forces OFF regardless of other flags.
  if (process.env.VERCEL_ENV === 'production') return false;
  // FAIL CLOSED: only the known dev/test environments may proceed. An unset or
  // unexpected NODE_ENV resolves to OFF.
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') return false;
  // Exact opt-in required.
  return process.env.E2E_AUTH_BYPASS === '1';
}

/** Parse a Playwright-set `e2e_user` cookie into a real Session, or null. */
export function e2eSessionFromCookie(raw: string | undefined | null): Session | null {
  if (!e2eAuthEnabled() || !raw) return null;
  try {
    const u = JSON.parse(decodeURIComponent(raw));
    if (!u?.id || !u?.role) return null;
    return buildSession(String(u.id), {
      email: u.email ?? 'e2e@test.local',
      name: u.name ?? 'E2E User',
      avatar_url: null,
      role: u.role,
      agency: u.agency ?? null,
      is_active: true,
      status: 'active',
      formal_title: u.title ?? null,
    });
  } catch {
    return null;
  }
}
