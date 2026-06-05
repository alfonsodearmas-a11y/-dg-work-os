// P5 — HELD FOR CUTOVER (step C4). NOT ACTIVE.
//
// Next.js only treats the ROOT /middleware.ts as middleware, so this file is inert
// until it REPLACES /middleware.ts at cutover. The public-path allowlist and the
// `config.matcher` below are kept BYTE-IDENTICAL to the current middleware.ts.
//
// Do not import this from anywhere; it exists to be reviewed and then moved to the
// repo root during the cutover sitting (with your go-ahead).
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Allowlist — identical to middleware.ts (kept in sync; any change must mirror it).
function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/403' ||
    pathname === '/set-password' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/push/') ||
    pathname.startsWith('/api/notifications/generate') ||
    pathname.startsWith('/api/action-items/poll-fireflies') ||
    pathname.startsWith('/api/action-items/digest') ||
    pathname.startsWith('/api/webhooks/') ||
    pathname.startsWith('/api/integrations/trello/webhook') ||
    pathname.startsWith('/api/ai/precompute-daily') ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/oversight/sync') ||
    pathname.startsWith('/api/tm/cron/') ||
    pathname.startsWith('/serwist') ||
    pathname.startsWith('/upload')
  );
}

export async function middleware(req: NextRequest) {
  // Start with a passthrough response we can attach refreshed cookies to.
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        response = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT (#1 @supabase/ssr footgun): getUser() refreshes the session, and the
  // SAME `response` object (carrying the refreshed Set-Cookie headers) MUST be
  // returned — otherwise the cookie never persists and users bounce to /login.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return response;

  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Deactivation: deactivated users are BANNED via auth.admin (Part 3d), so their
  // session is invalid → getUser() returns null → handled above as a /login
  // redirect. (The old NextAuth middleware redirected blanked-token users to /403;
  // with Supabase, ban-driven session invalidation supersedes that. The /403 page
  // remains for the Google domain-whitelist denial handled in the OAuth callback.)
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icons|splash|manifest\\.json|sw\\.js|serwist|ministry-logo\\.png|app-icon\\.png).*)',
  ],
};
