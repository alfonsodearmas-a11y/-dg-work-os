import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-utils';

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

  const passwordHash = await bcrypt.hash(password, 12);

  // Atomic: UPDATE only if the token still matches (prevents TOCTOU race).
  // If a concurrent request already consumed the token, this returns zero rows.
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      password_hash: passwordHash,
      invite_token: null,
      invite_token_expires_at: null,
    })
    .eq('invite_token', token)
    .gte('invite_token_expires_at', new Date().toISOString())
    .select('id, email')
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 400 });
  }

  return NextResponse.json({ success: true, email: updated.email });
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
