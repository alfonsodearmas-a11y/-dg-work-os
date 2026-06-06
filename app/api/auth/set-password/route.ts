import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

/** Look up user by invite token and verify it hasn't expired. */
async function validateToken(token: string) {
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, email, name, invite_token_expires_at')
    .eq('invite_token', token)
    .single();

  if (error || !user) return { valid: false as const, error: 'Invalid or expired invite link' };

  if (user.invite_token_expires_at && new Date(user.invite_token_expires_at) < new Date()) {
    return { valid: false as const, error: 'This invite link has expired. Please contact your administrator for a new invite.' };
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

  // Consume the token only after the password is set (token-match condition so
  // a concurrently re-issued invite token isn't clobbered).
  await supabaseAdmin
    .from('users')
    .update({ invite_token: null, invite_token_expires_at: null })
    .eq('id', result.user.id)
    .eq('invite_token', token);

  return NextResponse.json({ success: true, email: result.user.email });
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
