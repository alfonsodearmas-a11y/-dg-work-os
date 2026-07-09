import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db-admin';
import { getServerSupabase } from '@/lib/supabase/server';
import { withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

/** Look up user by invite token and verify it hasn't expired. */
async function validateToken(token: string) {
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, email, name, status, invite_token_expires_at')
    .eq('invite_token', token)
    .single();

  if (error || !user) return { valid: false as const, error: 'Invalid or expired invite link' };

  if (user.invite_token_expires_at && new Date(user.invite_token_expires_at) < new Date()) {
    return { valid: false as const, error: 'This invite link has expired. Please contact your administrator for a new invite.' };
  }

  // A token is only valid while the profile is mid-onboarding. suspend/archive/
  // deactivate set is_active=false WITHOUT clearing invite_token, so a token
  // held past deactivation must not silently reactivate the account (the POST
  // below both flips status→active and auto-signs-in). Reject anything but
  // 'pending'. (resend_invite is itself gated to pending users, so a fresh
  // token can never point at a non-pending profile.)
  if (user.status !== 'pending') {
    return { valid: false as const, error: 'This invite is no longer valid. Please contact your administrator.' };
  }

  return { valid: true as const, user };
}

// POST /api/auth/set-password — Token-based password setup for invited users
export const POST = withErrorHandler(async (req: NextRequest) => {
  const { token, password } = await req.json();

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Invalid or missing token' }, { status: 400 });
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const result = await validateToken(token);
  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Supabase Auth owns credentials post-cutover: set the password on the
  // auth.users record (same uuid as public.users via users_id_authusers_fkey).
  // The legacy users.password_hash column is dead — GoTrue never reads it.
  const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(result.user.id, {
    password,
  });

  if (pwError) {
    logger.error({ err: pwError }, 'set-password: auth.admin.updateUserById failed');
    return NextResponse.json({ error: 'Could not set password. Please contact your administrator.' }, { status: 500 });
  }

  // Consume the token and complete onboarding — but ONLY while the profile is
  // still 'pending' (defense-in-depth over validateToken's status check: closes
  // the suspend-between-validate-and-write race). Promoting out of 'pending'
  // matters because is_active=true is what assignee pickers and every
  // notification fan-out filter on (auth() has a safety-net promotion too).
  // token-match keeps a concurrently re-issued invite token from being clobbered.
  const { data: promoted } = await supabaseAdmin
    .from('users')
    .update({
      invite_token: null,
      invite_token_expires_at: null,
      is_active: true,
      status: 'active',
    })
    .eq('id', result.user.id)
    .eq('invite_token', token)
    .eq('status', 'pending')
    .select('id');

  if (!promoted || promoted.length === 0) {
    // Profile was suspended/archived/deactivated between validation and now:
    // the password was set, but do NOT reactivate the account or hand it a
    // session. It stays gated by buildSession (!is_active && status!=='pending').
    logger.warn(
      { userId: result.user.id },
      'set-password: profile no longer pending at consume — skipping activation and auto sign-in',
    );
    return NextResponse.json({ success: true, signedIn: false, email: result.user.email });
  }

  // Establish a real session server-side so the invitee lands signed in instead
  // of being bounced to /login. getServerSupabase() is the @supabase/ssr client
  // bound to next/headers cookies — writable in route handlers, so the session
  // cookies ride out on this response. Any failure falls back to the manual
  // /login flow: onboarding never breaks on this step.
  let signedIn = false;
  try {
    const supabase = await getServerSupabase();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: result.user.email,
      password,
    });
    if (signInError) {
      logger.warn(
        { err: signInError, userId: result.user.id },
        'set-password: auto sign-in failed — falling back to /login',
      );
    } else {
      signedIn = true;
    }
  } catch (err) {
    logger.warn(
      { err, userId: result.user.id },
      'set-password: auto sign-in threw — falling back to /login',
    );
  }

  return NextResponse.json({ success: true, signedIn, email: result.user.email });
});

// GET /api/auth/set-password?token=xxx — Validate token before showing the form
export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const result = await validateToken(token);

  if (!result.valid) {
    return NextResponse.json({ valid: false, error: result.error });
  }

  return NextResponse.json({ valid: true, name: result.user.name, email: result.user.email });
});
