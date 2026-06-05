import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

// Supabase OAuth (Google) PKCE code exchange. The login page's
// signInWithOAuth({ provider: 'google' }) sends users through Supabase → Google
// and back here with ?code=...; we exchange it for a cookie session, then bounce
// to ?next (default '/'). Public path (allow-listed in middleware.ts).
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');
  // Only allow same-origin relative redirects.
  const next = nextParam && nextParam.startsWith('/') ? nextParam : '/';

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
