import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/supabase/server';

// Supabase auth callback (public path, allow-listed in middleware.ts). Two modes:
//
// 1. PKCE code exchange (?code=...) — OAuth sign-in.
// 2. Email action links (?token_hash=...&type=recovery|magiclink) — our
//    forgot-password / magic-link emails carry a hashed_token from
//    auth.admin.generateLink; verifyOtp() consumes it and sets the cookie
//    session. Recovery then lands on /reset-password (via ?next).
const EMAIL_OTP_TYPES: readonly string[] = ['recovery', 'magiclink', 'email', 'invite', 'signup', 'email_change'];

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const nextParam = searchParams.get('next');
  // Only allow same-origin relative redirects.
  const next = nextParam && nextParam.startsWith('/') ? nextParam : '/';

  if (tokenHash && type && EMAIL_OTP_TYPES.includes(type)) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Expired/used link — bounce somewhere the user can request a fresh one.
    const retry = type === 'recovery' ? '/forgot-password?error=expired' : '/login?error=link_expired';
    return NextResponse.redirect(`${origin}${retry}`);
  }

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
