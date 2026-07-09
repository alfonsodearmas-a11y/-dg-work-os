import 'server-only';
import { cookies } from 'next/headers';
import { getServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/db-admin';
import { buildSession, type Session, type ProfileRow } from '@/lib/auth-session';
import { e2eAuthEnabled, e2eSessionFromCookie } from '@/lib/e2e-auth';
import { logger } from '@/lib/logger';

// P3 — reimplemented auth() over Supabase Auth: the cutover replacement for the
// NextAuth auth() in lib/auth.ts.
//
// NOT YET WIRED into requireRole()/middleware in Part 1 — repointing those is the
// cutover (C3/C4). Until then this is exercised ONLY by /api/auth/me and the
// contract test. It returns the EXACT session shape NextAuth's auth() returns
// (see lib/auth-session.ts), so the cutover swap is a one-line repoint.

export type { Session };

export async function auth(): Promise<Session | null> {
  // E2E ONLY (dead in production — see lib/e2e-auth.ts): return the deterministic
  // cookie session with no Supabase/DB contact.
  if (e2eAuthEnabled()) {
    const c = await cookies();
    const e2e = e2eSessionFromCookie(c.get('e2e_user')?.value);
    if (e2e) return e2e;
  }

  const supabase = await getServerSupabase();

  // Hot path: getClaims() verifies the JWT locally (via JWKS) when asymmetric
  // signing keys are enabled — no GoTrue round-trip across the 249 routes.
  let uid: string | undefined;
  try {
    const { data, error } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (!error && sub) uid = String(sub);
  } catch {
    // fall through to getUser()
  }

  // Correctness fallback: getUser() validates against GoTrue.
  if (!uid) {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    uid = data.user.id;
  }

  // Role/agency stay authoritative in public.users and are read fresh per request
  // (matches the current jwt-callback behaviour — role changes take effect at once).
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('email, name, avatar_url, role, agency, is_active, status, formal_title')
    .eq('id', uid)
    .single();

  // First-authenticated-request promotion: a 'pending' profile that reaches this
  // point has a live Supabase session, so onboarding is complete — promote to
  // active. Idempotent (`status='pending'` guard), fire-and-forget so the request
  // never blocks; failures are logged with the user id and retried naturally on
  // the next request. The superadmin owner account is never touched (it is never
  // 'pending'; the email guard makes that a hard guarantee).
  if (profile && profile.status === 'pending' && profile.email !== 'alfonso.dearmas@mpua.gov.gy') {
    void supabaseAdmin
      .from('users')
      .update({ status: 'active', is_active: true, last_login: new Date().toISOString() })
      .eq('id', uid)
      .eq('status', 'pending')
      .then(({ error }) => {
        if (error) {
          logger.error({ err: error, userId: uid }, '[auth] pending→active promotion failed');
        }
      });
    // Reflect the promotion in this request's session immediately.
    profile.status = 'active';
    profile.is_active = true;
  }

  return buildSession(uid, (profile as ProfileRow | null) ?? null);
}
