import 'server-only';
import { getServerSupabase } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/db';
import { buildSession, type Session, type ProfileRow } from '@/lib/auth-session';

// P3 — reimplemented auth() over Supabase Auth: the cutover replacement for the
// NextAuth auth() in lib/auth.ts.
//
// NOT YET WIRED into requireRole()/middleware in Part 1 — repointing those is the
// cutover (C3/C4). Until then this is exercised ONLY by /api/auth/me and the
// contract test. It returns the EXACT session shape NextAuth's auth() returns
// (see lib/auth-session.ts), so the cutover swap is a one-line repoint.

export type { Session };

export async function auth(): Promise<Session | null> {
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
    .select('email, name, avatar_url, role, agency, is_active, status')
    .eq('id', uid)
    .single();

  return buildSession(uid, (profile as ProfileRow | null) ?? null);
}
