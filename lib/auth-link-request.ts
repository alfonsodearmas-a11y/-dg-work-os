import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { checkAuthEmailRateLimit, getClientIp } from '@/lib/auth-rate-limit';
import { getAppBaseUrl, sendPasswordResetEmail, sendMagicLinkEmail } from '@/lib/auth-emails';

// Shared handler for the two public auth-link endpoints (forgot-password,
// magic-link). Flow: validate → rate-limit → look up the account → generate a
// Supabase action link via auth.admin.generateLink → email the hashed_token
// link through our Gmail pipeline → /auth/callback verifies it (verifyOtp).
//
// ANTI-ENUMERATION CONTRACT: every outcome except malformed input / rate-limit
// returns the SAME success response. Unknown emails, deactivated accounts, and
// internal failures are logged server-side but never surfaced to the caller.

const bodySchema = z.object({ email: z.string().email() });

const SUCCESS = { success: true } as const;

export async function handleAuthLinkRequest(
  req: NextRequest,
  type: 'recovery' | 'magiclink',
): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();

  if (!checkAuthEmailRateLimit(email, getClientIp(req))) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes and try again.' },
      { status: 429 },
    );
  }

  // Look up the profile. Anything short of an active (or mid-onboarding
  // 'pending') account silently no-ops — same response either way.
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, name, is_active, status')
    .eq('email', email)
    .single();

  if (!user || (!user.is_active && user.status !== 'pending')) {
    logger.info({ type, known: !!user }, 'auth-link: no-op (unknown or inactive account)');
    return NextResponse.json(SUCCESS);
  }

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type,
    email,
  });

  const hashedToken = linkData?.properties?.hashed_token;
  if (linkError || !hashedToken) {
    // e.g. profile exists but auth.users record is missing — log loudly, reveal nothing.
    logger.error({ err: linkError, type }, 'auth-link: generateLink failed');
    return NextResponse.json(SUCCESS);
  }

  // Build our own callback URL from the hashed token (verifyOtp path) instead
  // of using Supabase's action_link/redirect allowlist.
  const baseUrl = getAppBaseUrl();
  const next = type === 'recovery' ? '/reset-password' : '/';
  const url = `${baseUrl}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=${type}&next=${encodeURIComponent(next)}`;

  const name = user.name || email;
  const emailResult =
    type === 'recovery'
      ? await sendPasswordResetEmail({ to: email, name, resetUrl: url })
      : await sendMagicLinkEmail({ to: email, name, magicUrl: url });

  if (!emailResult.success) {
    logger.error({ type, err: emailResult.error }, 'auth-link: email send failed');
  }

  return NextResponse.json(SUCCESS);
}
